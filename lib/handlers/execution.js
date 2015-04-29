var g_q = require("q");
var g_eikonVersion = require("../utils/eikon/eikon-version-util");
var fs = require('fs');
var ObjectID = require('bson').ObjectID;
var log4js = require('log4js');
var path = require('path');

var ExecutionHandler = function (connection, broker, executor, channel, logger) {
    //private member
    var m_connection = connection,
        m_broker = broker,
        m_logger = logger,
        m_executor = executor,
        m_channel = channel,
     //   m_statusSilo = statusSilo,
        m_executionID = null,
        m_isStopping = false;

    // private function
    function setChannel(channel) {
        m_channel = channel;
    }

    // private function
    function addStatusMessageFeatures(message) {

        function createLogFile(fileName) {
            var loggerName = fileName;
            var logger = function(text) {
                if (global.useLogs) {
                    fs.appendFile(loggerName, text, function (err) {
                        if (err) console.error('unable to log to file ' + loggerName + ' content : ' + text);
                    });
                }
            };
            logger.fileName = path.basename(fileName);
            return logger;
        }

        var executionID = message.executionID;
        var statusRef = {};
        var statusTimestamp = Date.now();
        var loggerIndex = 1;
        message.index = 1;

        if (message.directory) {
            /**
             * Adding logging
             */
            message.logger = createLogFile(path.join(global.sharedDrive, message.directory, executionID + ".log"));
            message.testLogger = createLogFile(path.join(global.sharedDrive, message.directory, (loggerIndex++) + ".log"));
            message.stepLogger = createLogFile(path.join(global.sharedDrive, message.directory, (loggerIndex++) + ".log"));
        }

        message.populateStatusMessage = function (statusMessage) {
            if ('logger' in message) {
                if ("stepID" in statusMessage) {
                    statusMessage.log = message.stepLogger.fileName;
                    message.stepLogger = createLogFile(path.join(global.sharedDrive, message.directory, (loggerIndex++) + ".log"));
                } else if ("testID" in statusMessage) {
                    statusMessage.log = message.testLogger.fileName;
                    message.logger = createLogFile(path.join(global.sharedDrive, message.directory, (loggerIndex++) + ".log"));
                }
            }

            statusMessage.cta_version = global.version;
            if ("stepID" in statusMessage) {
                if (!statusRef[statusMessage.testID]) {
                    statusRef[statusMessage.testID] = {_id: new ObjectID(), "nbSteps": 0, version: 0};
                }
                statusMessage._testID = statusRef[statusMessage.testID]._id;
                statusRef[statusMessage.testID].nbSteps++;
            } else if ("testID" in statusMessage) {
                if (!statusRef[statusMessage.testID]) {
                    statusRef[statusMessage.testID] = {_id: new ObjectID(), "nbSteps": 0, version: 0};
                }
                statusRef[statusMessage.testID].version++;
                statusMessage._id = statusRef[statusMessage.testID]._id;
                statusMessage.nbSteps = statusRef[statusMessage.testID].nbSteps;
                statusMessage.version = statusRef[statusMessage.testID].version;
            }
            else  if ("logMessage" in statusMessage) {
                statusMessage.kind="Log";
                statusMessage.status=statusMessage.logLevel;
            }
            else if (!("kind" in statusMessage)) {
                statusMessage.kind="State";
                statusMessage.status=statusMessage.agentStatus;
                switch(statusMessage.agentStatus) {
                    case "pending": statusMessage.stidx=10; break;
                    case "Acked": statusMessage.stidx=30; break;
                    case "Running": statusMessage.stidx=50; break;
                    case "Cancelled": statusMessage.stidx=80; break;
                    case "Finished": statusMessage.stidx=100; break;
                }
            }

            statusMessage.executionID = executionID;
            statusMessage.statusTimestamp = Date.now();
            statusMessage.duration = statusMessage.statusTimestamp - statusTimestamp;
            statusTimestamp = statusMessage.statusTimestamp;
            statusMessage.index = (message.index++);
            if (!("_id" in statusMessage)) statusMessage._id = new ObjectID();
            if (statusMessage.screenshot === true) statusMessage.screenshot = statusMessage.index;
        };

        return message;
    }

    // private function
    function onCancelMessage(executionId) {
        if (m_executionID)
            m_isStopping = (m_executionID == executionId);
    }

    // private function
    function sendStatus(message, executionMessage) {
        if (m_broker) {
            m_broker.sendExecutionStatus(message, executionMessage);
        }
    }

    // private function
    function sendImmediateStatus(executionID, status) {
        m_broker.hackyBackup();
        var message = {};
        message.executionID = executionID;
        var l_executionMessage = addStatusMessageFeatures(message);
        var ackedPayload = {
            executionID: l_executionMessage.executionID,
            agentStatus: status
        };
        sendStatus(ackedPayload, l_executionMessage);
        m_broker.hackyRestore();
    }

    // private function
    function postExecute(p_executionMessage) {
        var l_postExecutionMessage = null;
        if (p_executionMessage.filename) {

            fs.unlink(p_executionMessage.filename, function (err) {
                if (err) {
                    l_postExecutionMessage = {
                        logMessage: ("unable to remove temporary script (" + p_executionMessage.filename + ") : " + err),
                        logTitle: ("error removing temporary script"),
                        logLevel: "ERROR"
                    };
                    sendStatus(l_postExecutionMessage, p_executionMessage);
                }
            });
        }

        if ("scripts" in p_executionMessage && "post" in p_executionMessage.scripts) {
            p_executionMessage.scripts.run = p_executionMessage.scripts.post;
            delete p_executionMessage.scripts.post;
            return m_executor.executeWithETAPEnvironment(p_executionMessage);
        }
        else return g_q();
    }

    // private function
    function createExecutionChannel() {
        var l_deferredReturn = g_q.defer();
        m_connection.createExecutionListener()
            .then(function (tmpChannel) {
                l_deferredReturn.resolve(tmpChannel);
            }, function (err) {
            l_deferredReturn.reject(err);
        });
        return l_deferredReturn.promise;
    }

    // private function
    var g_deferred = null;
    var onPayload = false;

    function doExecutionMessage(channel, executionID) {
        if (!g_deferred) {
            g_deferred = g_q.defer();
        }
        if (!m_isStopping) {
            channel.get(executionID, {noAck: true})
                .then(function (payload) {
                    try {
                        if (payload) {
                            //channel.ack(payload);
                            logger.debug('[p]payload found on %s[%s]', executionID, payload.content.toString());
                            onMessage(payload, true)
                                .then(function () {
                                    onPayload = true;
                                    doExecutionMessage(channel, executionID)
                                })
                        }
                        else {
                            if (!onPayload) {
                                // perform send status for done on ExecutionMessage reading
                                sendImmediateStatus(executionID, 'Acked');
                            }
                            logger.debug('[.]no%s payload found on %s', onPayload ? ' more' : '', executionID);
                            onPayload = false
                            g_deferred.resolve(false);
                        }
                    } catch (error) {
                        onPayload = false
                        g_deferred.resolve(false);
                        logger.debug(error.stack);
                        throw error;
                    }
                }, function (err) {
                    g_deferred.reject(err);
                    sendImmediateStatus(executionID, 'Acked');
                    onPayload = false;
                }).then(null, function () {
                    logger.debug("code give a real name failed !!!")
                });
        }
        else {
            g_deferred.reject('cancelling executionID:' + executionID + ' from execution queue');
        }
        return g_deferred.promise;
    }

    // private function
    function onExecutionMessage(executionID) {
        //reset stop flag if enter onExecutionMessage
        m_isStopping = false;
        var deferred = g_q.defer();
        createExecutionChannel()
            .then(function (channel) {
                doExecutionMessage(channel, executionID)
                    .then(function () {
                        deferred.resolve();
                        g_deferred = null;
                        channel.close();
                    }, function (err) {
                        deferred.resolve(err);
                        g_deferred = null;
                        channel.close();
                    }
                )
            });
        return deferred.promise;
    }

    // private function
    function onMessage(payload, onTmpChannel) {
        //reset stop flag if enter onMessage
        m_isStopping = false;
        var l_deferredReturn = g_q.defer();
        m_executor.executePreparatoryStep()
            .then(function () {
                doOnMessage(payload, onTmpChannel)
                    .then(function () {
                        l_deferredReturn.resolve();
                    }, function (error) {
                        l_deferredReturn.reject(error);
                    });
            });
        return l_deferredReturn.promise;
    };

    // private function
    function doOnMessage(payload, onTmpChannel) {
        var l_deferredReturn = g_q.defer();
        g_eikonVersion.getEIKONVersion()
            .then(function versionFound(eikonVersion) {
                var l_executionMessage = addStatusMessageFeatures(JSON.parse(payload.content.toString()));
                var l_executionAcknowledgmentMessage = {
                    executionID: l_executionMessage.executionID,
                    agentStatus: 'Running',
                    eikonVersion: eikonVersion
                };
                m_executionID = l_executionMessage.executionID;
                sendStatus(l_executionAcknowledgmentMessage, l_executionMessage);

                if (!onTmpChannel) {
                    m_channel.ack(payload);
                }

                var onExecutionEnd = function (error) {
                    m_logger.debug(error ? "On execution error" : "On execution success");
                    if (error) {

                        l_executionAcknowledgmentMessage = {
                            logMessage: ("Error while executing job : " + error),
                            logTitle: ("error in job execution"),
                            logLevel: "ERROR"
                        };

                        sendStatus(l_executionAcknowledgmentMessage, l_executionMessage);

                        //l_deferredReturn.resolve(error);
                    }

                    m_logger.debug("calling send status");

                    var finishedPayload = {
                        executionID: l_executionMessage.executionID,
                        agentStatus: 'Finished'
                    };

                    if (m_isStopping) {
                        //if execution has been cancelled send Cancelled status
                        finishedPayload.agentStatus = 'Cancelled';
                    }

                    sendStatus(finishedPayload, l_executionMessage);
                    // marking execution as done
                    l_executionMessage.isDone = true;

                    var postFinally = function (error) {
                        m_logger.debug("postFinally : " + error);
                        sendStatus(null, null);
                    };


                /*    m_statusSilo.flush().finally(function () {
                        postExecute(l_executionMessage).then(postFinally, postFinally).finally(function () {
                            l_deferredReturn.resolve(finishedPayload);
                        });
                    });  */
                };

                m_executor.executeWithETAPEnvironment(l_executionMessage)
                    .then(onExecutionEnd, onExecutionEnd);
            }).then(null, function (error) {
                m_logger.error("Error inside doOnMessage: " + error.stack);

                l_deferredReturn.reject(error);
            });
        return l_deferredReturn.promise;
    };

    // public function
    return {
        onMessage: onMessage,
        onExecutionMessage: onExecutionMessage,
        onCancelMessage: onCancelMessage,
        sendImmediateStatus: sendImmediateStatus,
        setChannel: setChannel
    }
}

//public constructor
module.exports = ExecutionHandler;
