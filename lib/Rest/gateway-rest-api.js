/**
 * Created by u6028908 on 09/04/2015.
 */
var http = require("http");
var express    = require('express');
var app = express();
var bodyParser = require('body-parser');
var q = require("q");

var logger = global.logger;
var g_brokerConnector_gateway = null;

var Connection = require('../Rabbitmq').Connection;
var server = global.mqServer;
var heartbeats = global.heartbeats || 60;

var g_statusQueue = 'etap.status';
var g_reportQueue = 'etap.report';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


var routeHandler = express.Router();

routeHandler.post('/', function(req, res) {
    var m_connection = Connection(server, heartbeats);
    m_statusSilo = new Silo("status." + global.agentHost +".");
    switch (req.method) {
        case 'POST':
            console.log(req.body);
            res.json({message: 'toto!'});

            switch (req.pathname) {
                case 'etap.status':
                    m_statusChannelWrapper = m_connection.createRabbitSender(g_statusQueue, m_statusSilo);
                case 'etap.report':
                    m_reportChannelWrapper = m_connection.createRabbitSender(g_reportQueue, new Silo("report." + global.agentHost +"."));

            }
    };
});
var l_deferredReturn = q.defer();

var start = function(gatewayBrokerConnector) {

    if (gatewayBrokerConnector == null) {
        logger.error("Please provide a broker connector before starting the rest api.")
        return;
    }

    g_brokerConnector_gateway = gatewayBrokerConnector;

    /**
     * Starts local REST server
     */
    var server = http.createServer(app);

    server.on('error', function (e) {
        if (e.code === "EADDRINUSE") {
            error("An other application is using the agent REST-API on port #" + global.agentPort + " !\nPerhaps another ETAPAgent is already running ?");
        }
        else error("The ETAPAgent encountered the following error on its REST-API server : " + e.message);

        try {
            server.close();
        } catch (e) {
        }
        ;
        tryToStartAgain();
    });

    server.listen(global.agentPort, function (err) {
        if (l_deferredReturn && err) return l_deferredReturn.reject();
        m_retrialNB = 0;
        logger.info('Express server [' + process.title + ':' + global.version + '] listening on port ' + global.agentPort);
        if (l_deferredReturn) l_deferredReturn.resolve();
        l_deferredReturn = null;
    });

    return l_deferredReturn ? l_deferredReturn.promise : null;
};

exports.start = start;
