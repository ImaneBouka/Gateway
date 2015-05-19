/**
 * Created by u6028908 on 28/04/2015.
 */

var request = require('request');
var g_broker = require('../gateway-broker-connector').GatewayBrokerConnector;

// global variables
var logger = global.logger;


var httpSender = function(ip) {
    var m_connection;

    this.setConnection = function (p_connection) {
        m_connection = p_connection;
    };

    this.close = function () {
        logger.debug("SendingChannelWrapper::close");
    };

    this.sendMessage = function (p_message, p_task) {
        /*   if (silo) {
         silo.addJob(p_message);
         return;
         } */

        logger.debug('2SendingChannelWrapper::doSendMessage(','proxy', p_message, ')');

        var options = {
           // url: 'http://' + g_broker.azureMachines[p_message.hostName] + ':3000/proxy',
            url: 'http://' + ip + ':3000/proxy/' + p_task,
            method: 'POST',
            json: true,
            body: p_message
        };

        request(options, function (error, response, body) {
            if (error)
                console.error(error);
            else {
                console.log(response.statusCode);
                if (response.statusCode == 200) {
                    console.log(body)
                }
            }
        });


    };
};
module.exports = httpSender;