/**
 * Created by u6028908 on 09/04/2015.
 */

var express    = require('express');
var app = express();
var bodyParser = require('body-parser');
var q = require("q");


var logger = global.logger;
var g_brokerConnector_gateway = null;
var Connection = require('../Rabbitmq').Connection;

var g_statusQueue = 'etap.status';
var g_reportQueue = 'etap.report';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var routeHandler = express.Router();

routeHandler.post('/' + g_reportQueue, function(req, res) {
    var instanceReport = req.body;
    req.ip === instanceReport.ip
    console.log(instanceReport);
    if (g_brokerConnector_gateway) {
    //    instanceReport.cloud = ....
        g_brokerConnector_gateway.sendReport(instanceReport);
        res.status(200).json({ message: 'report sent to gateway' });
    }
    else {
        res.status(500).json({ message: 'no gateway' });
    }
});

routeHandler.post('/' + g_statusQueue, function(req, res) {
    var instanceStatus = req.body;
    console.log(instanceStatus);
    if (g_brokerConnector_gateway) {
        g_brokerConnector_gateway.sendStatus(instanceStatus);
        res.status(200).json({ message: 'status sent to gateway' });
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
