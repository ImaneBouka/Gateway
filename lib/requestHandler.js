/**
 * Created by u6028908 on 08/04/2015.
 */
var fs = require ('fs');
var http = require('http');
var bodyParser = require('body-parser');




function queue(request, response) {
    console.log("Request handler 'queue' was called with body", request);
    response.writeHead(200, {"Content-Type": "text/html"});
    response.write("queue message");
    response.end();
}
/*function favicon(response) {
    console.log("Request handler 'favicon' was called.");
    var img = fs.readFileSync('./favicon.ico');
    response.writeHead(200, {"Content-Type": "image/x-icon"});
    response.end(img,'binary');
}
*/
app.use(bodyParser.json({ type: 'application/*+json' }));

app.use(function (req, res) {
    res.setHeader('Content-Type', 'text/plain')
    res.write('you posted:\n')
    res.end(JSON.stringify(req.body, null, 2))
})

app.post('/api/users', jsonParser, function (req, res) {
    if (!req.body) return res.sendStatus(400)
    // create user in req.body
})

function route(handle, pathname, request, response) {
    if (typeof handle[pathname] === 'function') {
        handle[pathname](request, response);
    } else {
        console.log("No request handler found for " + pathname);
        response.writeHead(404, {"Content-Type": "text/plain"});
        response.write("404 Not found");
        response.end();
    }
}
exports.queue = queue;
exports.route = route;
//exports.favicon = favicon;