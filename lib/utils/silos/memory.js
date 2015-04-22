// MemorySilo = function(highWaterMark, callback))
// highWaterMark : Number, maximum number of jobs to store in memory
// callback : Function, callback to call when there is no more silo files available
var MemorySilo = function(highWaterMark, callback) {

    // -------------------------------------------------------------------
    // Private part
    // -------------------------------------------------------------------

    // array of jobs
    var jobs = [];

    // -------------------------------------------------------------------
    // Public part
    // -------------------------------------------------------------------

    var addJob = this.addJob = function(job) {
        jobs.push(job);

        var memoryFull = jobs.length > highWaterMark;

        if (memoryFull) {
            var sentJobs = jobs;
            jobs = [];
            callback(sentJobs);
        }
    };

    this.addJobs = function(jobs) {
        jobs.forEach(function(job) {
            addJob(job);
        })
    };

    this.hasJobs = function() {
        return jobs.length > 0;
    };

    this.getJobs = function(deferred) {
        var sentJobs = jobs;
        jobs = [];

        if (deferred) deferred.promise.then(undefined, function failedToSendData() {
            jobs.forEach(function(job) {
                sentJobs.push(job);
            });
            jobs = [];
            callback(sentJobs);
        });

        return sentJobs;
    };
};

module.exports = MemorySilo;