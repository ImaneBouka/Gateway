var fs = require('fs');
var path = require('path');

// FileSilo = function(highWaterMark, callback, name)
// highWaterMark : Number, maximum number of jobs to store per file
// callback : Function, callback to call when there is no more silo files available
// name : String, used by FileSilo as prefix for files
var FileSilo = function(highWaterMark, callback, name) {

    var currentFile = null;
    var nbJobs = 0;
    var files = [];

    // -------------------------------------------------------------------
    // Private part
    // -------------------------------------------------------------------

    var listSiloFiles = function() {
        // read all existing silo files for given prefix name
        var siloFiles = fs.readdirSync(path.join(__dirname, "../../../",global.siloDir));
        var files = siloFiles.filter(function(fileName) {
            var doesStartWithPrefixName = fileName.indexOf(name) == 0;
            return doesStartWithPrefixName;
        }).sort(function(a, b) { return a > b });

        return files;
    };

    var createCurrentFile = function() {
        currentFile = name+new Date().getTime() + Math.random().toString(36).slice(2) + ".txt";
        files.push(currentFile);
    };

    var resetCurrentFile = function() {
        currentFile = null;
        nbJobs = 0;
    };

    var getJobsFromSilo = function(fileName) {
        var fileContent = fs.readFileSync(path.join(__dirname, "../../../",global.siloDir, fileName));
        var jobsString = '['+fileContent+']';
        var jobs = [];
        try {
            jobs = JSON.parse(jobsString);
        }
        catch (ex) {

        }
        return jobs;
    };

    // stack of silo files
    files = listSiloFiles();

    // -------------------------------------------------------------------
    // Public part
    // -------------------------------------------------------------------

    var addJob = this.addJob = function(job) {
        var noCurrentFile = currentFile == null;

        if (noCurrentFile) createCurrentFile();

        var canonicalFileName = path.join(__dirname, "../../../",global.siloDir,currentFile);

        fs.appendFileSync(canonicalFileName, (nbJobs?',':'')+JSON.stringify(job));

        nbJobs++;

        var currentFileFull = nbJobs == highWaterMark;

        if (currentFileFull) {
            resetCurrentFile();
        }
    };

    this.addJobs = function(jobs) {
        jobs.forEach(function(job) {
            addJob(job);
        })
    };

    this.hasJobs = function() {
        return files.length > 0;
    };

    this.getJobs = function(deferred) {
        var jobs=[];

        if (files.length == 0) {
            callback();
        } else if (files.length > 0) {
            // read first file in stack of silos
            var filename = files.shift();

            if (files.length == 0) resetCurrentFile();

            jobs = getJobsFromSilo(filename);

            var sentData = function(){
                fs.unlink(path.join(__dirname, "../../../",global.siloDir,filename), function(err) {
                    if (err) console.error("unlink error : "+error);
                });
            };

            if (deferred) deferred.promise.then(sentData, function failedToSendData() {
                files.unshift(filename);
            });
            else {
                sentData();
            }
        }

        return jobs;
    };
};

module.exports = FileSilo;