/**
 * Created by u6028908 on 08/04/2015.
 */
var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');
//var mongoose   = require('mongoose');

// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 3003;

// ROUTES FOR OUR API
var router = express.Router();
router.post('/', function(req, res) {
    console.log(req.body);
    res.json({ message: 'welcome!!' });
});
app.use('/api', router);

// connect to our database
//mongoose.connect('mongodb://...');  Later!!

// START THE SERVER
app.listen(port);
console.log('Server started on port: ' + port);