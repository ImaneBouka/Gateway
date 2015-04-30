/**
 * Created by u6028908 on 09/04/2015.
 */

var express    = require('express');
var app = express();
var bodyParser = require('body-parser');
var q = require("q");

var logger = global.logger;
var g_brokerConnector_gateway = null;

var g_statusQueue = 'etap.status';
var g_reportQueue = 'etap.report';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


var routeHandler = express.Router();

/*
routeHandler.post('/', function(req, res) {
    var m_connection = Connection(server, heartbeats);
    m_statusSilo = new Silo("status." + global.agentHost +".");
    switch (req.method) {
        case 'POST':
            console.log(req.body);

            switch (req.pathname) {
                case 'etap.status':
                    m_statusChannelWrapper = m_connection.createRabbitSender(g_statusQueue, m_statusSilo);
                case 'etap.report':
                    m_reportChannelWrapper = m_connection.createRabbitSender(g_reportQueue, new Silo("report." + global.agentHost +"."));

            }
    };
});
*/

routeHandler.post('/' + g_reportQueue, function(req, res) {
    var body = req.body;
    console.log(body);
    if (g_brokerConnector_gateway) {
        g_brokerConnector_gateway.sendReport(body);
        res.status(200).json({ message: 'sent to gateway' });
    }
    else {
        res.status(500).json({ message: 'no gateway' });
    }
});

app.use('/', routeHandler);
app.listen(process.env.PORT || 3003);

var start = function(gatewayBrokerConnector) {
    var defer = q.defer();

    if (gatewayBrokerConnector == null) {
        logger.error("Please provide a broker connector before starting the rest api.")
        defer.reject();
    }
    else {
        g_brokerConnector_gateway = gatewayBrokerConnector;
        defer.resolve();
    }
    return defer.promise;
};

exports.start = start;
