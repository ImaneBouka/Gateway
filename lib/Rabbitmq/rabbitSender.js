/**
 * Created by u6028908 on 20/04/2015.
 */

var q = require("q");

// global variables
var logger = global.logger;

var rabbitmqSender = function(p_queue)
{
    this.qq = p_queue;
    var m_channel = null,
        m_connection,
        m_queue = p_queue;

    // -------------------------------------------------------------------
    // Private functions
    // -------------------------------------------------------------------
/*
    var sendData = function(deferredReturn) {

        try {

            var p_channel = m_channel;

            if (p_channel) {

                var str_message = JSON.stringify(p_message);

                logger.debug("SendingChannelWrapper::doSendMessage("+m_queue+","+str_message+")");

                logger.debug("Sending message : " + str_message);
                p_channel.on('drain', function() {
                    logger.error("drain : could not send message : "+str_message);
                });
                p_channel.sendToQueue(m_queue, new Buffer(str_message), {persistent: true, contentType: 'application/json'}, function(err, ok) {
                    if (err !== null) {
                        logger.error('Message nacked! '+str_message);
                        deferredReturn.reject();
                    }
                    else {
                        logger.debug("sent successfully (and confirmed) "+str_message);
                        deferredReturn.resolve();
                    }
                });

            } else {
                logger.debug("Ignoring sendData call as no channel is ready.");
                deferredReturn.reject();
            }

        } catch (ex) {
            // if anything wrong, reject !
            logger.error("sendData exception : "+ex.stack);
            deferredReturn.reject();
        }

    };
*/
    var createChannel = function()
    {
        logger.debug("SendingChannelWrapper::createChannelAndSendMessage("+m_queue+")");
        if (m_connection) {
            m_connection.createConfirmChannel().then(function finalizeChannelCreation(p_channel){

                p_channel.on("close", function(){
                    logger.info("closed the channel : " + m_queue);
                    m_channel = null;
                    createChannel();
                });

                p_channel.on("error", function(err){
                    logger.error("Error on the channel : " + m_queue + " " + err);
                });

                p_channel.assertQueue(m_queue, {durable: true})
                    .then(function() {
                        m_channel = p_channel;
                    });
            });
        }
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

    // -------------------------------------------------------------------
    // Public functions
    // -------------------------------------------------------------------

    this.setConnection = function(p_connection) {
        m_connection = p_connection;

        closeChannel();

        createChannel(m_queue);
    };

    this.close = function()
    {
        logger.debug("SendingChannelWrapper::close");
        if(m_channel)
        {
            try {
                logger.debug("SendingChannelWrapper::m_channel.close()");
                m_channel.close();
            } catch (e)
            {
                logger.error("caught error while closing channel: "+ e.stack);
            }
            m_channel = null;
        }
    };

    this.sendMessage = function(p_message)
    {
        /*if (silo) {
            silo.addJob(p_message);
            return;
        } */
        var str_message = JSON.stringify(p_message);

        logger.debug("2SendingChannelWrapper::doSendMessage("+m_queue+","+str_message+")");

        var p_channel = m_channel;

        if (p_channel) {

            logger.debug("2Sending message : " + str_message);
            p_channel.on('drain', function() {
                logger.error("2drain : could not send message : "+str_message);
            });
            if (p_channel.sendToQueue(m_queue, new Buffer(str_message), {persistent: true, contentType: 'application/json'}))
                logger.debug("2sent successfully "+str_message);

        } else logger.debug("2Ignoring message : " + str_message); // TODO SILO !!!
    };
};

module.exports = rabbitmqSender;