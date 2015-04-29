var g_q = require("q");

var SystemLowPriorityHandler = function(executor, channel, logger) {
  //private member
  var m_logger = logger;
  var m_executor = executor;
  var m_channel = channel;

  //private function
  function setChannel(channel) {
    m_channel = channel;
  }

  //private function
  function onMessage (payload)
  {
    var l_deferredReturn = g_q.defer();
    m_executor.executePreparatoryStep()
      .then(function(){
        doOnMessage(payload)
          .then(function (){
            l_deferredReturn.resolve(true);
          });
      });
    return l_deferredReturn.promise;
  };

  //private function
  function doOnMessage(payload) {
    var l_deferredReturn = g_q.defer();
    var l_executionMessage = JSON.parse(payload.content.toString());
    m_channel.ack(payload);
    m_executor.executeWithETAPEnvironment(l_executionMessage)
      .then(function onSuccess() {
        l_deferredReturn.resolve(true);
      }, function onError(err) // We should do something specific onError later
      {
        m_logger.error("Error inside executeWithETAPEnvironment : " + err.stack);
        //m_channel.ack(payload);
        l_deferredReturn.resolve(err);
      }).then(null, function(error) {
        m_logger.error("Error inside doOnMessageSystemLowPriorityQueue : " + error.stack);
        //m_channel.ack(payload);
        l_deferredReturn.reject(error);
      });
    return l_deferredReturn.promise;
  }

  // public function
  return {
    onMessage : onMessage,
    setChannel : setChannel
  }
}
//public constructor
module.exports = SystemLowPriorityHandler;