var readLine = require ("readline");

var logger = global.logger;

module.exports = function(terminateNicely) {
    /**
     * Trying to terminate nicely in all occasions.
     * But we still have an issue in webstorm and when killing from task manager
     */
    // TODO : terminateNicely with task manager and webstorm
    if (process.platform === "win32"){
        var rl = readLine.createInterface ({
            input: process.stdin,
            output: process.stdout
        });

        rl.on ("SIGINT", function (){
            logger.info("Ctrl-C received, exiting...");
            process.emit ("SIGINT");
        });
    }

    process.on('uncaughtException', function ( err ) {
        logger.error('An uncaughtException was found : ' + err.stack);
        process.exit(1);
    });

    process.on("SIGINT", terminateNicely);
}