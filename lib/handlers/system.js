// SystemHandler object
var SystemHandler = function(executor, channel, logger) {
  //private member
  var m_logger = logger;
  var m_executor = executor;
  var m_channel = channel;

  //private function
  function setChannel(channel) {
    m_channel = channel;
  }

  //private function
  function onMessage(p_payload) {
    m_logger.info('[s]system handler executing %s', p_payload.content.toString());
    m_executor.executeWithPreparatoryStep(doOnMessage, p_payload);
  };

  //private function
  function doOnMessage(p_payload) {
    var l_executionMessage = JSON.parse(p_payload.content.toString());
    if(l_executionMessage.scripts.runNewAgent)
      l_executionMessage.scripts.run = l_executionMessage.scripts.runNewAgent;
    m_channel.ack(p_payload);
    m_executor.executeWithETAPEnvironment(l_executionMessage)
      .then(function onSuccess() {
      }, function onError() // We should do something specific onError later
      {
        m_logger.error("Error inside doOnMessageSystemQueue");
      }).then(null, function(error) {
        m_logger.error("Error inside doOnMessageSystemQueue : "+error.stack);
      });
  }

  // public function
  return {
    onMessage : onMessage,
    setChannel : setChannel
  }
}
//public constructor
module.exports = SystemHandler;