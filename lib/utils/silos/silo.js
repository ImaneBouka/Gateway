var FileSilo = require("./file");
var MemorySilo = require("./memory");
var util = require("util");
var q = require('q');

// Silo = function(name, config)
// name : String, used by FileSilo as prefix for files
// config : Object, define highWaterMark and notificationInterval
var Silo = function(name, config) {

    if (name == null || name.length == null || name.length ==0 || util.isArray(name)) throw new Error("Incorrect prefix for silos");

    // -------------------------------------------------------------------
    // Private part
    // -------------------------------------------------------------------

    var isMemorySilo = false;

    var siloConfig = {};

    // merge config object into private
    if (config) Object.keys(config).forEach(function(key) { siloConfig[key] = config[key]; });

    siloConfig.highWaterMark = siloConfig.highWaterMark || global.highWaterMark || 80;
    siloConfig.notificationInterval = siloConfig.notificationInterval || global.notificationInterval || 5000;

    // lowWaterMark = function()
    // lowWaterMark is called by FileSilo when it no longer has files on disk
    var lowWaterMark = function() {
        isMemorySilo = true;
        var isSiloReaderReady = !!siloReaderCallback;
        if (isSiloReaderReady) {
            currentSilo = memorySilo;
        }
    };

    // highWaterMark = function(jobs)
    // jobs : Array, list of jobs to put in FileSilo
    // highWaterMark is called by MemorySilo when it reached too many jobs in memory
    var highWaterMark = function(jobs) {
        isMemorySilo = false;
        currentSilo = fileSilo;
        fileSilo.addJobs(jobs);
        notifySiloReader();
    };

    var fileSilo = new FileSilo(siloConfig.highWaterMark, lowWaterMark, name);
    var memorySilo = new MemorySilo(siloConfig.highWaterMark, highWaterMark);
    var currentSilo = fileSilo;
    var siloReaderCallback = null;

    var timeoutID = null;

    function notify() {
        var deferredReturn = q.defer();

        if (siloReaderCallback == null) {
            deferredReturn.reject("noCallback");
        } else
        if (currentSilo.hasJobs())
            siloReaderCallback(deferredReturn);
        else
            deferredReturn.reject();

        return deferredReturn.promise;
    }

    var notifying = false;

    var notifySiloReader = function() {
        var deferredReturn = q.defer();

        if (notifying) return;
        clearTimeout(timeoutID);
        notifying = true;

        notify().then(function ifok() {
            notifying = false;
            notifySiloReader().then(function() {
                deferredReturn.resolve();
            }, function() {
                deferredReturn.reject();
            });
        }, function ifko(noCallback) {
            notifying = false;
            if (noCallback != "noCallback")
                timeoutID = setTimeout(notifySiloReader, siloConfig.notificationInterval);
            deferredReturn.reject();
        });

        return deferredReturn.promise;
    };

    // -------------------------------------------------------------------
    // Public part
    // -------------------------------------------------------------------

    this.addJob = function(job) {
        currentSilo.addJob(job);

        if (isMemorySilo) {
            notifySiloReader();
        }
    };

    this.getJobs = function(deferred) {
        return currentSilo.getJobs(deferred);
    };

    this.start = function(callback) {
        siloReaderCallback = callback;

        timeoutID = setTimeout(notifySiloReader, siloConfig.notificationInterval);
    };

    this.flush = function() {
        return notifySiloReader();
    };

    this.stop = function() {
        siloReaderCallback = null;

        clearTimeout(timeoutID);
        if (currentSilo === memorySilo) {
            currentSilo = fileSilo;
            highWaterMark(memorySilo.getJobs());
        }
    };
};

module.exports = Silo;