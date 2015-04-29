// global variables
var logger = global.logger;
var g_q = require("q");

var ExecutionListener = function()
{
    var m_channel,
        self = this,
        m_connection,
        m_busy = false,
        m_paused = false,
        m_connected = false,
        m_done = false;

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

    var createExecutionChannel = function()
    {
      var l_deferredReturn = g_q.defer();
        try {
            if (m_connection)
              logger.debug("[c]creating execution channel");

            if (m_connection && !isDone()) {
              m_connection.createChannel()
                .then(function finalizeChannelCreation(p_channel) {
                  setConnected(true);
                  m_channel = p_channel;
                  // code to auto restart the channel.
                  p_channel.on("close", function () {
                    logger.debug("[c]closed the execution channel [%s]", p_channel.ch);
                    setConnected(false);

                  });
                  p_channel.on("error", function (err) {
                    logger.error("[err]error on the execution channel : " + err);
                  });
                  logger.debug("[f]finalizing execution channel creation");
                  l_deferredReturn.resolve(p_channel);
                });
            }  else {
              logger.debug("No connection hence not creating channel.");
              l_deferredReturn.reject("No connection hence not creating channel.");
            }
        } catch (e1) {
            logger.error("caught error while creating channel : "+e1.message);
          l_deferredReturn.reject(e1);
        }
      return l_deferredReturn.promise;
    };

    // -------------------------------------------------------------------
    // Public functions
    // -------------------------------------------------------------------

    this.setConnection = function(p_connection) {
      var l_deferredReturn = g_q.defer();

        logger.debug("setConnection...");
        m_connection = p_connection;

/*        if (isConnected()) {
            closeChannel();
        }*/

        if (m_connection && !isBusy() && !isPaused() && !isDone()) {
            createExecutionChannel().then ( function(channel){
              l_deferredReturn.resolve(channel);
            });
        }
      return l_deferredReturn.promise;
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
            createExecutionChannel(m_queue);
        }
    };

    this.ack = function()
    {
        logger.debug("Finishing work on queue: " + m_queue);
        setBusy(false);
        if (m_connection && !isPaused() && !isConnected() && !isDone()) {
            logger.debug("Recreating channel after ack for queue : " + m_queue);
            createExecutionChannel(m_queue);
        }
    };
};

module.exports = ExecutionListener;