'use strict';
/**
 * Created by u0119273 on 6/3/2014.
 */
var g_q = require("q");
var logger = global.logger;
var executor = require('./executor');
var fs = require('fs');
//var Silo = require("./utils/silos/silo");
var g_broker = require('./gateway-broker-connector').GatewayBrokerConnector;
var objectid = require('bson').ObjectID;

var SystemHandler = require('./handlers/system');
var SystemLowPriorityHandler = require('./handlers/system-lowpriority');
var ExecutionHandler = require('./handlers/execution');

var m_systemHandler = null;
var m_systemlowpriorityHandler = null;
var m_executionHandler = null;

// hostname.etap.[jobs{.listen | subscribe} | system | systemlowpriority]
var m_channel = null;
var m_busy = false;
var m_hasPending = 0;
var m_pendingSysLowMessages = [];
var m_pendingExecMessages = [];
//var m_statusSilo = new Silo("status");
var m_connection = null;
var m_isStart = true;
var m_donePriorMessage = false;
var m_priorMessageCount = -1;
var m_executionID = null;
var m_executionPayload = null;
var m_currentTask = '';

var doPendingMessage = function pendingMessage () {
  var pendingMsg = null;
  var pendingPayload = null;
  // Do not swap order of systemlow and jobs queue
  if (m_pendingSysLowMessages.length > 0) {
    pendingMsg = m_pendingSysLowMessages.shift();
    pendingPayload = pendingMsg.payload;
  }
  else if(m_pendingExecMessages.length > 0){
    pendingMsg = m_pendingExecMessages.shift();
    pendingPayload = pendingMsg.payload;
  }
  else {
    logger.debug('[.]no pending message')
  }

  if (pendingPayload != null) {
    m_hasPending--;
    doProcessMessage(pendingPayload, m_channel);
  }
};

function getInternalQueue(){
  //please be careful using this
  //because it is the real copy of the internal queue array
  return {"syslowMessages": m_pendingSysLowMessages, "execMessages": m_pendingExecMessages};
}

function findPendingMessage(messageArray, executionID) {
    var msg = null;
    messageArray.some(function(message) {
        if(message.executionID && message.executionID == executionID) {
            msg = message;
            return true;
        }
    })
    return msg;
}

function cancelPendingExecution(executionID) {
    var cancelledPayload = null;
    var cancelledMsg = removePendingMessage(executionID);

    if (cancelledMsg) {
        cancelledPayload = cancelledMsg.payload;
        logger.debug('[x]cancel executionID:%s from internal queue', executionID)
    }
    else {
        logger.debug('[x]cancel executionID:%s not found in internal queue', executionID)
    }
    return cancelledPayload;
};

function resetInternalQueue(){
  m_pendingSysLowMessages = [];
  m_pendingExecMessages = [];
  m_hasPending = 0;
}

function removeMessage(executionID) {
    var targetMsg;
    if(executionID) {
        targetMsg = removePendingMessage(executionID);
        if(targetMsg && targetMsg.payload) {
            m_channel.ack(targetMsg.payload)
            m_executionHandler.sendImmediateStatus(executionID, 'Cancelled');
        }
    }
    return targetMsg;
}

function clearMessage(queue) {
    //remove and ack current messages from internal queue
    var syslowMessages = []; //m_pendingSysLowMessages.splice(0,m_pendingSysLowMessages.length);
    var executionMessages = []; //m_pendingExecMessages.splice(0,m_pendingExecMessages.length);
    var messages = [];

    if (queue) {
        switch (queue.toLowerCase()) {
            case 'jobs' :
                executionMessages = m_pendingExecMessages.splice(0,m_pendingExecMessages.length);
                break;
            case 'systemlowpriority' :
                syslowMessages = m_pendingSysLowMessages.splice(0,m_pendingSysLowMessages.length);
                break;
        }
    }
    else {
        executionMessages = m_pendingExecMessages.splice(0, m_pendingExecMessages.length);
        syslowMessages = m_pendingSysLowMessages.splice(0, m_pendingSysLowMessages.length);
    }

    messages = syslowMessages.concat(executionMessages);
    messages.forEach( function (message){
        m_channel.ack(message.payload);
        if (objectid.isValid(message.executionID)) {
            m_executionHandler.sendImmediateStatus(message.executionID, 'Cancelled');
        }
    })

    return messages;
}

function removePendingMessage(executionID) {
    var targetMsg;
    var removedMsg = [];
    if (executionID) {
        if (m_pendingExecMessages.length > 0) {
            targetMsg = findPendingMessage(m_pendingExecMessages, executionID);
            if(targetMsg) {
                removedMsg = m_pendingExecMessages.splice(m_pendingExecMessages.indexOf(targetMsg),1);
                if(removedMsg.length == 1) {
                    m_hasPending--;
                    return removedMsg[0];
                }
            }
        }

        if (!targetMsg && m_pendingSysLowMessages.length > 0) {
            targetMsg = findPendingMessage(m_pendingSysLowMessages, executionID);
            if(targetMsg) {
                removedMsg = m_pendingSysLowMessages.splice(m_pendingSysLowMessages.indexOf(targetMsg),1);
                if(removedMsg.length == 1) {
                    m_hasPending--;
                    return removedMsg[0];
                }
            }
        }
    }
    return removedMsg[0];
}

var doProcessMessage = function (payload) {
  var msgRoutingKey = payload.fields.routingKey;
  var topics = msgRoutingKey.split('.');
  var i = (topics[1] === 'azure') ? 2 : 1;
    var host = topics[i] || '';
    if (!host in g_broker.azureMachines) {
        console.error("Machine does not exist");
        return;
    }
  var task = topics[i + 1] || '';
  var action = topics[i + 2];
  var msgBody = payload.content.toString();
  var msgObject = JSON.parse(msgBody);
  var msgDetail = 'topic:'  + msgRoutingKey + ' msg:' + msgBody;
  task = task.toLowerCase().trim();
  switch (task) {
    case 'system':
      if (msgObject.executionID && msgObject.stopCommand) {
        if (m_executionID == msgObject.executionID) {
          m_executionHandler.onCancelMessage(m_executionID);
          m_systemHandler.onMessage(payload);
        }
        else {
          var targetPayload = cancelPendingExecution(msgObject.executionID);
          if (targetPayload) {
            logger.debug('[s]system message cancel pending executionId:%s ', msgObject.executionID);
            m_channel.ack(targetPayload);
          }
          //message may on longer in internal queue and also not running at agent but the cancel message take into agent account
          if (objectid.isValid(msgObject.executionID)) {
            m_executionHandler.sendImmediateStatus(msgObject.executionID, 'Cancelled');
          }
          m_channel.ack(payload);
        }
      }
      else {
        m_systemHandler.onMessage(payload);
      }
      // do pending message in case system is first occur
      if (!m_busy) {
        //if (m_hasPending > 0) {
          doPendingMessage();
        //}
      }
      break;
    case 'systemlowpriority':
      var executionID = msgObject.executionID;
      if (!m_busy) {
        m_busy = true;
        m_currentTask = msgRoutingKey;
        logger.debug('[l]executing systemlowpriority [%s]', msgDetail)
        var handler = m_systemlowpriorityHandler;
        //payload.content.executionID
        if (objectid.isValid(executionID)) {
          m_executionID = executionID;
          handler = m_executionHandler;
          logger.debug('[h]switch handler to [%s] for executionID[%s]', 'm_executionHandler', executionID);
        }
        handler.onMessage(payload)
          .then(function allOK(){
            m_busy = false;
            //if (m_hasPending > 0) {
              doPendingMessage();
           // }
          }, function problem(err) {
                m_busy = false;
                logger.error('[err]systemlowpriority: ', err);
                doPendingMessage();
            });
      }
      else {
        m_hasPending++;
        m_pendingSysLowMessages.push({executionID:executionID,payload: payload});
        logger.debug('[+]agent is busy processing:%s message push %s to internal queue[%s]', m_currentTask, task , m_pendingSysLowMessages.length);
      }
      break;
    case 'jobs':
      var executionID = JSON.parse(payload.content.toString()).executionID;
      if (!m_busy) {
        m_busy = true;
        m_executionID = executionID;
        m_currentTask = task;
        if (action == "listen") {
          m_currentTask = task + '.' + action;
          //var executionID = JSON.parse(payload.content.toString()).executionID;
          // Create Channel
          logger.debug('[e]executing job on queue %s', executionID);
          m_executionHandler.onExecutionMessage(executionID)
            .then(function allOK(data) {
                  m_busy = false;
                  m_channel.ack(payload);
                  if(data)
                    logger.debug('[e]%s ', data);
                  logger.debug('[e]execution on queue %s is done, perform acknowledge on message:[%s]', executionID, msgBody);
                  //if (m_hasPending > 0) {
                    doPendingMessage();
                  //}
                }, function problem(error){
                m_busy = false;
                logger.error('[err] error inside onExecutionMessage: ' + error);
                // if (m_hasPending > 0) {
                doPendingMessage();
                // }
              });
        } else {
          logger.debug('[e]executing job %s', msgDetail);
          m_executionHandler.onMessage(payload)
            .then(function allOK(){
              m_busy = false;
             // if (m_hasPending > 0) {
                doPendingMessage();
             // }
            }, function problem(error){
                  m_busy = false;
                  logger.error('[err] error inside onMessage: ' + error);
                  // if (m_hasPending > 0) {
                  doPendingMessage();
                  // }
              });
        }
      }
      else {
        m_hasPending++;
        m_pendingExecMessages.push({executionID:executionID,payload: payload});
        logger.debug('[+]agent is busy processing:%s message push %s to  internal queue[%s]', m_currentTask, task, m_pendingExecMessages.length);
      }
      break;
    default:
      logger.debug('[a]perform ack on unknown routing key:%s msg:%s', msgRoutingKey, payload.content.toString());
      m_channel.ack(payload);
      //if (m_hasPending > 0) {
        doPendingMessage();
      //}
  }

};

function onPriorMessage(p_priorMessageCount) {
  // return false immediately if no p_priorMessageCount
  if(p_priorMessageCount == 0)
    return false;

  if (m_priorMessageCount == -1) {
    m_priorMessageCount = p_priorMessageCount
  }

  if(m_priorMessageCount > 0) {
    m_priorMessageCount--;
  }
  // true, still consuming prior message. false, no more prior messages
  return (m_priorMessageCount > 0);
}

function initHandler(p_channel, p_connection) {
  // connection
  m_connection = p_connection;
  // channel
  m_channel = p_channel;

  if (!m_systemHandler) {
    // construct SystemHandler
    m_systemHandler = new SystemHandler(executor, m_channel, logger);
  } else {
    m_systemHandler.setChannel(p_channel);
  }

  if (!m_systemlowpriorityHandler) {
    // construct SystemLowPriorityHandler
    m_systemlowpriorityHandler = new SystemLowPriorityHandler(executor, m_channel, logger);
  } else {
    m_systemlowpriorityHandler.setChannel(p_channel);
  }

  if (!m_executionHandler) {
    // construct ExecutionHandler
    m_executionHandler = new ExecutionHandler(m_connection, g_broker, executor, m_channel, logger);
  } else {
    m_executionHandler.setChannel(p_channel);
  }
}

var onMessage  = function (payload, p_channel, p_connection, p_priorMessageCount){

  // initialize on start
  initHandler(p_channel, p_connection);
  if(m_isStart) {
    m_donePriorMessage = (p_priorMessageCount == 0);
    m_isStart = false;
  }


  // if on prior message do the process message
  if(m_donePriorMessage) {
    doProcessMessage(payload);
  }
  else {
    // check if have priorMessage then pause to put message to internal queue (m_busy = true)
    m_currentTask = 'prior message';
    m_busy = true;
    //when m_busy is true, doProcessMessage will put to internal queue
    doProcessMessage(payload);
    if(!onPriorMessage(p_priorMessageCount)) {
      // if no more prior message to fetch.
      // enable process message, unset m_busy flag
      m_busy = false;
      // flag when done with prior messages
      m_donePriorMessage = true;
      // precess message in queue
      doPendingMessage();
    }
  }
}
//module.exports = ProcessMessage;
exports.onMessage = onMessage;
exports.resetInternalQueue = resetInternalQueue;
exports.getInternalQueue = getInternalQueue;
exports.removeMessage = removeMessage;
exports.clearMessage = clearMessage;