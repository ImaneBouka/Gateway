var log4js = require('log4js');
var os=require('os');
var path = require('path');

var cmdLineHost = null;
if(process.argv[2])
  cmdLineHost = process.argv[2].toLowerCase();

var agentHost = cmdLineHost || os.hostname().toLowerCase();


log4js.configure({
    "appenders": [
        {
            "type": "console",
            "category": "agent"
        },
        {
            "type": "file",
            "filename": path.join(__dirname, '..', '..', agentHost+".log"),
            "maxLogSize": 1024*1024*10,
            "backups": 10,
            "category": "agent"
        }
    ]
}, {});
var logger = global.logger = log4js.getLogger("agent");
