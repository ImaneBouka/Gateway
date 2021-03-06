/**
 * Created by u6028908 on 17/04/2015.
 */

"use strict";

var os=require('os');
var g_q = require("q");

var Connection = require('./Rabbitmq/index').Connection;
var executor = require('./executor');


var server = global.mqServer;
var heartbeats = global.heartbeats || 60;

var logger = global.logger;


var g_topicExchange = [global.applicationName,'topic'].join('.');

var g_statusQueue = 'etap.status';
var g_reportQueue = 'etap.report';

exports.GatewayBrokerConnector = function()
{

    this.getCurrentExecutionID = function (){
        if (m_executionMessage == null) {
            logger.debug("There is no current execution, unable to provide data");
            return null;
        }
        return m_executionMessage.executionID;
    };

    this.sendStatus = function(p_message)
    {
        logger.debug("sendStatus("+JSON.stringify(p_message)+")");
        m_statusChannelWrapper.sendMessage(p_message);
        return p_message;
    };

    this.takeScreenshot = function(screenshotName) {
        var l_deferredReturn = g_q.defer();

        if (m_executionMessage == undefined) {
            l_deferredReturn.reject("Unable to take screenshot : no running execution");
            return l_deferredReturn.promise;
        }

        if (m_executionMessage.directory == undefined) {
            l_deferredReturn.reject("Unable to take screenshot : no available execution directory");
            return l_deferredReturn.promise;
        }

        var screenshotCmd = {
            "scripts" : {},
            "directory" : m_executionMessage.directory
        };

        if (process.platform === 'win32') {
            screenshotCmd.scripts.run = __dirname + '\\..\\libs\\screenshot-cmd.exe -o "%ETAP_EXECUTION_DIR%\\screenshot-' + global.agentHost + '-' + screenshotName + '.png"';
        }
        else {
            //var l_deferredReturn = g_q.defer();
            l_deferredReturn.reject("Unable to take screenshot : no screenshot utility on UNIX(-like) systems is configured");
            return l_deferredReturn.promise;
        }

        executor.executeWithPreparatoryStep(function() {
            executor.executeWithETAPEnvironment(screenshotCmd).then(function onSuccess() {
                l_deferredReturn.resolve();
            }, function onFailure() {
                l_deferredReturn.reject();
            })
        });

        return l_deferredReturn.promise;
    };

    this.getStatus = function() {
        if (m_executionMessage == null) {
            return "Pending";
        }
        else {
            return "Executing " + m_executionMessage.executionID;
        }
    };

    this.updateInstanceInformation = function(p_chocolateyInstalledSoftwarePackages) {
        logger.debug("updateInstanceInformation("+JSON.stringify(p_chocolateyInstalledSoftwarePackages)+")");
        var instanceInformationMessage = {'hostName': global.agentHost, 'ip': m_agentIP, 'softs': p_chocolateyInstalledSoftwarePackages};

            m_reportChannelWrapper.sendMessage(instanceInformationMessage);
    };

    this.azureMachines = {};

    this.sendReport = function(report) {
        var m_topicQueue = [global.applicationName,'azure',report.hostName].join('.');
        var m_topicPattern = [global.applicationName,'azure',report.hostName,'#'].join('.');
        this.azureMachines[report.hostName] = m_connection.createTopicListener(g_topicExchange, m_topicQueue, m_topicPattern, report.ip);
        this.azureMachines[report.ip] = this.azureMachines[report.hostName];
        m_reportChannelWrapper.sendMessage(report);
        console.log(this.azureMachines);
    };

    this.end = function()
    {
        m_connection.end();
    };

    this.start = function()
    {
        var l_deferredReturn = g_q.defer();
        m_connection.start().then(l_deferredReturn.resolve);
        return l_deferredReturn.promise;
    };

    var hacky;

    exports.hackyBackup = function() {
        hacky = m_executionMessage;
    };
    exports.hackyRestore = function(){
        m_executionMessage = hacky;
    };

    exports.sendExecutionStatus = function(p_message, p_executionMessage) {
        m_executionMessage = p_executionMessage;
        if (m_executionMessage) self.sendStatus(p_message);
    };

    // constructor
    var m_connection = Connection(server, heartbeats),

        m_executionMessage = null,
    // New communication
        //m_topicChannelWrapper = m_connection.createTopicListener(g_topicExchange, g_topicQueue,g_topicPattern),
        m_statusChannelWrapper = m_connection.createRabbitSender(g_statusQueue),
        m_reportChannelWrapper = m_connection.createRabbitSender(g_reportQueue),
        self = this,
        interfaces=os.networkInterfaces(),
        m_agentIP =  (function(){

            for (var interfaceIndex in interfaces) {
                for(var detailsIndex = 0; detailsIndex < interfaces[interfaceIndex].length; detailsIndex++ )
                {
                    var details = interfaces[interfaceIndex][detailsIndex];
                    if (details.family === 'IPv4' && details.address !== "127.0.0.1") {
                        return details.address;
                    }
                }
            }
        })();
    // end of constructor
};