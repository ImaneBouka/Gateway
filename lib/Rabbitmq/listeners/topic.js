/**
 * Created by u6028908 on 27/04/2015.
 */
// global variables
var logger = global.logger;
var g_messageHandler = require('../../process-message');

var Listener = function(topic, queue, pattern, connectionObj)
{
    var m_channel;
    var self = this;
    var m_topic = topic;
    var m_queue = queue;
    var m_pattern = pattern;
    var m_connection; // Rabbit Connection
    var m_busy = false;
    var m_paused = false;
    var m_connected = false;
    var m_done = false;
    var m_connectionObj = connectionObj;
    // -------------------------------------------------------------------
    // Private functions
    // -------------------------------------------------------------------

    var setBusy = function(on) {
        m_busy = on;
    };

    var isBusy = function() {
        return m_busy;
    };

    var setPaused = function(on) {
        m_paused = on;
    };

    var isPaused = function() {
        return m_paused;
    };

    var setConnected = function(on) {
        m_connected = on;
    };

    var isConnected = function() {
        return m_connected;
    };

    var setDone = function(on) {
        m_done = on;
    };

    var isDone = function() {
        return m_done;
    };

    var closeChannel = function() {
        if (m_channel != null)
            try {
                m_channel.close();
                m_channel = null;
            } catch (e)
            {
                logger.error("caught error while closing channel: "+ e.stack);
            }
        else logger.error("tried to close null channel !!!");
    };

    var createChannel = function(p_topic, p_queue, p_pattern)
    {
        try {
            if (m_connection) logger.debug("[c]creating channel for queue: %s, to bind with topic: %s",p_queue,p_topic);
            m_topic = p_topic;
            m_queue = p_queue;
            m_pattern = p_pattern;

            if (m_connection && !isDone()) m_connection.createChannel()
                .then(function finalizeChannelCreation(p_channel){
                    logger.debug("[f]finalizing channel creation for topic: " + p_topic + " on queue : " + p_queue);

                    setConnected(true);

                    m_channel = p_channel;

                    // code to auto restart the channel after 30 secs.
                    p_channel.on("close", function() {
                        logger.info("[c]closed the channel : " + p_queue);
                        setConnected(false);
                        g_messageHandler.resetInternalQueue();
                    });

                    p_channel.on("error", function(err){
                        logger.error("[err]error on the channel : " + p_queue + " " + err);
                    });

                    p_channel.assertExchange(p_topic, 'topic', {durable: true, autoDelete: false})
                        .then(function() {
                            //logger.debug("assert exchange: " + p_topic);
                            p_channel.assertQueue(p_queue, {durable: true, autoDelete: false})
                                .then(function(){
                                    //logger.debug("assert queue: " + p_queue);
                                    p_channel.bindQueue(p_queue, p_topic, p_pattern)
                                        .then (function() {
                                        logger.debug("[b]bind queue: " + p_queue + " to topic: " + p_topic + " with pattern: " + p_pattern);
                                        var priorMessageCount = 0;
                                        p_channel.assertQueue(p_queue, {durable: true, autoDelete: false})
                                            .then(function(queueInfo){
                                                priorMessageCount = queueInfo.messageCount;
                                                logger.debug('[m]prior message count on queue %s[%s]',p_queue, priorMessageCount);
                                                p_channel.consume(p_queue, function onMessage(p_payload){
                                                    if (p_payload == null) {
                                                        logger.info("Consumer on queue  : " + p_queue + " has been cancelled.");
                                                        return;
                                                    }
                                                    logger.debug("[p]consuming payload on queue: %s, topic: %s payload :%s" ,p_queue, p_payload.fields.routingKey, p_payload.content.toString());
                                                    //setBusy(true);
                                                    //logger.debug("[s]starting work on topic : %s", p_payload.fields.routingKey);
                                                    // ProcessMessage
                                                    g_messageHandler.onMessage(p_payload, p_channel, m_connectionObj, priorMessageCount);
                                                }, {noAck: false});
                                            }, function(err) {
                                                logger.error('[err]error while asserting queue %s[%s]',p_queue, err);
                                            })
                                    }, function(err) {
                                        logger.error('[err]error while binding queue: ' + p_queue + ' to topic: ' + p_topic + ' with pattern: ' + p_pattern);
                                    });
                                }, function(err) {
                                    logger.error('[err]error while asserting queue: ' + p_queue);
                                });
                        }, function(err){
                            logger.error('[err]error while asserting exchange: ' + p_topic);
                        });
                    logger.debug("[f]finalized channel creation for "+p_queue);
                }, function (reason) {
                    logger.error("Could not create channel : "+reason);
                });
            else logger.info("No connection hence not creating channel.");

        } catch (e1) {
            logger.error("caught error while creating channel : "+e1.message);
        }
    };

    // -------------------------------------------------------------------
    // Public functions
    // -------------------------------------------------------------------

    this.setConnection = function(p_connection) {
        logger.info("setConnection...");
        m_connection = p_connection;

        if (isConnected()) {
            closeChannel();

        }

        if (m_connection && !isBusy() && !isPaused() && !isDone()) {
            createChannel(m_topic, m_queue, m_pattern);
        }
    };

    var close = this.close = function()
    {
        setDone(true);
        closeChannel();
    };

    this.pause = function()
    {
        logger.debug("Pausing channel wrapper for queue : " + m_queue);
        setPaused(true);
        if (isConnected()) closeChannel();
    };

    this.resume = function()
    {
        logger.debug("Resuming channel wrapper for queue : " + m_queue);
        setPaused(false);
        if (m_connection && !isBusy() && !isConnected() && !isDone()) {
            logger.debug("Recreating channel after resuming for queue : " + m_queue);
            createChannel(m_queue);
        }
    };

    this.ack = function()
    {
        logger.debug("Finishing work on queue: " + m_queue);
        setBusy(false);
        m_pauseHandler && m_pauseHandler(self, true);
        if (m_connection && !isPaused() && !isConnected() && !isDone()) {
            logger.debug("Recreating channel after ack for queue : " + m_queue);
            createChannel(m_queue);
        }
    };
};

module.exports = Listener;