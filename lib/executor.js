/**
 * Created by JF on 12/10/13.
 */

var g_q = require("q");
var g_spawn = require("child_process").spawn;
var path = require('path');
var os = require('os');
var fs = require('fs');

if (!("tmpdir" in os)) os.tmpdir = os.tmpDir;
if (!('EOL' in os)) {
    os.EOL = (process.platform === 'win32') ? '\r\n' : '\n';
}
var tmpDir = global.tmpDir || os.tmpdir();

// global variables
var logger = global.logger;

var getScriptCmdLine = function(p_executionMessage, filename) {
    var l_scriptExecutionCommand =
    {
        executionID: p_executionMessage.executionID,
        command: 'cmd',
        commandparams: ['/c', filename]
    };
    //if (executionDir) l_scriptExecutionCommand.commandparams = ["logDir=" + process.cwd()]; // first parameter given to script is current directory
    return l_scriptExecutionCommand;
};

var Executor = {

    executeWithETAPEnvironment : function(p_executionMessage)
    {
        if("scripts" in p_executionMessage && "run" in p_executionMessage.scripts)
        {
            var l_deferredReturn = g_q.defer();
            p_executionMessage.filename = path.join(tmpDir, new Date().getTime() + Math.random().toString(36).slice(2) + ".bat");
            var runScript;
            var options = null;

            if (process.platform === 'win32') {
                runScript = 'set ETAP_SHARED_DRIVE=' + global.sharedDrive + os.EOL;
                if (p_executionMessage.directory) {
                    runScript += 'set ETAP_EXECUTION_DIR=' + path.join('%ETAP_SHARED_DRIVE%', p_executionMessage.directory.replace('/', '\\')) + os.EOL ;
                    runScript += p_executionMessage.scripts.run.replace(/^set ETAP_EXECUTION_DIR=.*/, '').trim();
                }
                else
                    runScript += p_executionMessage.scripts.run.trim();
            } else {
                options = { mode:493 };
                runScript = "#!/bin/bash\nexport ETAP_SHARED_DRIVE=" + global.sharedDrive + os.EOL;
                if (p_executionMessage.directory) {
                    runScript += 'export ETAP_EXECUTION_DIR=' + path.join("$ETAP_SHARED_DRIVE", p_executionMessage.directory) + os.EOL;
                }
                runScript += p_executionMessage.scripts.run.replace(/^set ETAP_EXECUTION_DIR=.*/, '').trim();
            }

            fs.writeFile(p_executionMessage.filename, runScript, options, function(err) {
                if(err) {
                    l_deferredReturn.reject("unable to create temporary script ("+p_executionMessage.filename+") : "+err);
                } else {
                    fs.chmodSync(p_executionMessage.filename, 493);
                    Executor.execute(getScriptCmdLine(p_executionMessage, p_executionMessage.filename), p_executionMessage)
                        .then(function onScriptExecutionSuccess()
                        {
                            l_deferredReturn.resolve();
                        }, function onScriptExecutionError(reason)
                        {
                            l_deferredReturn.reject(reason);
                        });
                }
            });

            return l_deferredReturn.promise;
        }
        else
        {
            return Executor.execute(p_executionMessage, p_executionMessage);
        }
    },

    executeWithPreparatoryStep : function(functionToExecute, payload) {
        var l_preparatoryStepCommand =
        {
            executionID: "PreparatoryStep",
            command: __dirname + "/../preparatorystep.bat",
            commandparams: [ global.sharedDrive ]
        };
        if (process.platform === 'win32') Executor.execute(l_preparatoryStepCommand)
            .then(function onSuccess() {
                functionToExecute(payload);
            }, function OnError() // onError we run the rest as well as in may work without the preparatory step.
            {
                logger.debug("Error on preparatory steps.");
                functionToExecute(payload);
            });
        else functionToExecute(payload);
    },

  executePreparatoryStep : function() {
    var l_deferredReturn = g_q.defer();
    var l_preparatoryStepCommand =  {
      executionID: "PreparatoryStep",
      command: __dirname + "/../preparatorystep.bat",
      commandparams: [ global.sharedDrive ]
    };

    if (process.platform === 'win32') {
      Executor.execute(l_preparatoryStepCommand)
        .then(function onSuccess() {
          //functionToExecute(payload);
          l_deferredReturn.resolve(process.platform);
        }, function OnError(err) // onError we run the rest as well as in may work without the preparatory step.
        {
          logger.debug("Error on preparatory steps.");
          //functionToExecute(payload);
          l_deferredReturn.resolve(err);
        });
    }
    else {
      l_deferredReturn.resolve(process.platform);
      //functionToExecute(payload);
    }//functionToExecute(payload);

    return l_deferredReturn.promise;
  },

    execute : function(l_executionMessage, message) {
        var m_child = null;

        if(m_child)
        {
            m_child = null;
            logger.error("Agent Error : I'm executing new stuff while I'm already busy.");
        }

        var l_deferredReturn = g_q.defer();

        try {

            logger.info("spawning : " + l_executionMessage.command + " " + JSON.stringify(l_executionMessage.commandparams));
            m_child = g_spawn(l_executionMessage.command, l_executionMessage.commandparams, { windowsVerbatimArguments: (process.platform === 'win32') });

            m_child.on('close', function onClose(code) {
                // Let's wait in case we haven't received all status from this command
                setTimeout(function delayCloseEventBy1Second() {
                    logger.info("execution:onClose - " + code);
                    if (code !== 0) {
                        // TODO : should pass error code for reporting to central system ?
                        l_deferredReturn.reject(code);
                    } else {
                        l_deferredReturn.resolve();
                    }
                    m_child = null;
                },1000);
            });

            m_child.on('error', function onError(err) {
                if ("logger" in l_executionMessage) {
                    l_executionMessage.logger("Error received from spawned process : " + err);
                }
                logger.error("Error received from spawned process : " + err);
            });

            m_child.stdout.setEncoding('utf8');
            m_child.stdout.on('data', function (data) {
                var dataStr = data.trim();
                if (dataStr) {
                    if (message && "logger" in message) {
                        message.logger('[out]'+dataStr+'[/out]');
                        message.testLogger('[out]'+dataStr+'[/out]');
                        message.stepLogger('[out]'+dataStr+'[/out]');
                    }
                    logger.debug('[out]'+dataStr+'[/out]');
                }
            });

            m_child.stderr.setEncoding('utf8');
            m_child.stderr.on('data', function (data) {
                var dataStr = data.trim();
                if (dataStr) {
                    if (message && "logger" in message) {
                        message.logger('[err]'+dataStr+'[/err]');
                        message.testLogger('[err]'+dataStr+'[/err]');
                        message.stepLogger('[err]'+dataStr+'[/err]');
                    }
                    logger.error('[err]'+dataStr+'[/err]');
                }
            });
        } catch (error) {
            if (message && "logger" in message) {
                l_executionMessage.logger("Error while executing : "+(l_executionMessage?JSON.stringify(l_executionMessage):"null"));
            }
            logger.error("Error while executing : "+(l_executionMessage?JSON.stringify(l_executionMessage):"null"));
            l_deferredReturn.reject(error);
        }

        return l_deferredReturn.promise;
    }
};

module.exports = Executor;
