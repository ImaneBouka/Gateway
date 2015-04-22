/**
 * Created by u6028908 on 21/04/2015.
 */
// node_modules requires
var g_amqp = require('amqplib');
var g_q = require("q");

// local requires
//var TopicListener = require("./listeners/topic");
//var ExecutionListener = require("./listeners/execution");
var rabbitSender = require("./rabbitSender");

// global variables
var logger = global.logger;

var Connection = function (server, heartbeat) {

    var channels = [];
    var m_connectionRetrialNB = 0;
    var m_connection = null;
    var m_shuttingDown = false;

    var tryToStartAgain = function () {
        m_connectionRetrialNB++;
        if (m_connectionRetrialNB > 60) m_connectionRetrialNB=60; // Stephane lame attempt at not waiting forever
        logger.debug("Restarting connection : " + m_connectionRetrialNB);
        setTimeout(function () {
            start();
        }, 1000 * m_connectionRetrialNB);
    };

    this.end = function () {
        m_shuttingDown = true;

        channels.forEach(function(channel) {
            channel.close();
        });

        if (m_connection) {
            m_connection.close();
            m_connection = null;
        }
    };

   /* this.createTopicListener = function(topic, queue, pattern) {
        var listener = new TopicListener(topic, queue, pattern, this);
        channels.push(listener);
        return listener;
    };

    this.createExecutionListener = function() {
        var l_deferredReturn = g_q.defer();
        var tempListener = new ExecutionListener();
        channels.push(tempListener);
        tempListener.setConnection(m_connection)
            .then(function(channel) {
                l_deferredReturn.resolve(channel)
            });
        return l_deferredReturn.promise;
    }; */

    this.createRabbitSender = function(queue, silo) {
        var rabbitSender = new rabbitSender(queue, silo);
        channels.push(rabbitSender);
        return rabbitSender;
    };

    var start = this.start = function () {
        var l_deferredReturn = g_q.defer();

        logger.info("Connecting to amqp://" + server + '?heartbeat=60');
        g_amqp.connect('amqp://' + server + '?heartbeat=60').then(function finalizeConnection(p_connection) {

            var closed = false;

            m_connection = p_connection;
            m_connectionRetrialNB = 0;
            m_connection.on("error", function (err) {

                logger.error((new Date().toLocaleTimeString()) + " : " + "Rabbit MQ connection error : " + err);
            });
            m_connection.on("close", function () {
                if (closed) return;
                closed = true;
                m_connection = null;

                channels.forEach(function(channel) {
                    channel.setConnection(null);
                });

                logger.debug((new Date().toLocaleTimeString()) + " : " + "Rabbit MQ connection closing");
                if (!m_shuttingDown) {
                    tryToStartAgain();
                }
            });

            channels.forEach(function(channel) {
                channel.setConnection(m_connection);
            });

            l_deferredReturn.resolve();
        }, function onStartingConnectionError(error) {
            l_deferredReturn.reject(error);
            tryToStartAgain();
        });

        return l_deferredReturn.promise;
    };

};

var staticConnection;

module.exports = function(server, heartbeat) {
    if (staticConnection) return staticConnection;
    staticConnection = new Connection(server, heartbeat)
    //use params to create staticConnection;
    return staticConnection;
};