/**
 * Created by u6028908 on 28/04/2015.
 */

var q = require("q");

// global variables
var body = require('../server');
var logger = global.logger;

var httpSender = function(p_queue) {
    this.qq = p_queue;
    var m_channel = null,
        m_connection,
        m_queue = p_queue;


    // -------------------------------------------------------------------
    // Private functions
    // -------------------------------------------------------------------


// -------------------------------------------------------------------
    // Public functions
    // -------------------------------------------------------------------

    this.setConnection = function (p_connection) {
        m_connection = p_connection;

        closeChannel();

        createChannel(m_queue);
    };

    this.close = function () {
        logger.debug("SendingChannelWrapper::close");
        if (m_channel) {
            try {
                logger.debug("SendingChannelWrapper::m_channel.close()");
                m_channel.close();
            } catch (e) {
                logger.error("caught error while closing channel: " + e.stack);
            }
            m_channel = null;
        }
    };

    this.sendMessage = function (p_message) {
     /*   if (silo) {
            silo.addJob(p_message);
            return;
        } */
        var p_message = body;
        var str_message = JSON.stringify(p_message);

        logger.debug("2SendingChannelWrapper::doSendMessage(" + m_queue + "," + str_message + ")");

        var p_channel = m_channel;

        if (p_channel) {

            logger.debug("2Sending message : " + str_message);
            p_channel.on('drain', function () {
                logger.error("2drain : could not send message : " + str_message);
            });
            if (p_channel.sendToQueue(m_queue, new Buffer(str_message), {
                    persistent: true,
                    contentType: 'application/json'
                }))
                logger.debug("2sent successfully " + str_message);

        } else logger.debug("2Ignoring message : " + str_message); // TODO SILO !!!

    };
};
module.exports = httpSender;