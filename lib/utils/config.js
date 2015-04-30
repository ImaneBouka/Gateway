/**
 * Created by u6028908 on 21/04/2015.
 */
var fs = require('fs');
var os=require('os');
var path = require('path');
var extend = require('./extend');
var agentPackage = require('../../package.json');
global.version = agentPackage.version;

var logger = global.logger;

global.configuration = require('../../config.json');
global.agentHost =  os.hostname().toLowerCase();
global.applicationName = 'cta';

var localConfFile = path.join(__dirname, '../../config.' + os.hostname() + '.json');
if (fs.existsSync(localConfFile)) {
    var localConf = require(localConfFile);
    logger.info('Local configuration for ' + os.hostname() + ' is ' + JSON.stringify(localConf, null, 4));
    extend(true, true, global.configuration, localConf);
    logger.info('New configuration is ' + JSON.stringify(global.configuration, null, 4));
} else {
    logger.info('No local configuration for ' + os.hostname());
}


if (process.argv.length > 2) {
    /**
     * Override global variable with commandline args
     * usege: node gateway.js agentHost agentPort mqServer sharedDrive
     * example: node gateway.js machine01 3011 localhost m:
     */
    var cmdConf = {};
    if(process.argv[2])
        cmdConf.agentHost = process.argv[2].toLowerCase();

    if(process.argv[3])
        cmdConf.agentPort = process.argv[3];

    if(process.argv[4])
        cmdConf.mqServer = process.argv[4];

    if(process.argv[5])
        cmdConf.sharedDrive = process.argv[5];
    logger.info('Command-line configuration is ' + JSON.stringify(cmdConf, null, 4));
    extend(true, true, global.configuration, cmdConf);
    logger.info('New configuration is ' + JSON.stringify(global.configuration, null, 4));
}

for(var key in global.configuration) {
    global[key] = global.configuration[key];
}

global.siloDir = global.siloDir || "silos";

fs.mkdir(path.join(__dirname, "../../",global.siloDir), function(err) {

});
