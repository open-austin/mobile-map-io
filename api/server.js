var http = require('http');
var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var mysql = require('mysql');
var request = require('request');
var cloudinary = require('cloudinary');
var dotenv = require('dotenv').config({path: __dirname + '/.env'});

var refugeUrl = 'http://www.refugerestrooms.org/api/v1/';

// Configure database connection
function Connection() {
    this.pool = null;

    this.init = function() {
        this.pool = mysql.createPool({
            connectionLimit: 10,
            host     : process.env.HOSTNAME,
            user     : process.env.USERNAME,
            password : process.env.PASSWORD,
            database : process.env.DATABASE,
            debug    : false
        });
    };

    this.acquire = function(callback) {
        this.pool.getConnection(function(err, connection) {
            callback(err, connection);
        });
    };
}

// see: http://stackoverflow.com/questions/7067966/how-to-allow-cors-in-express-nodejs
function allowCrossDomain(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
        res.sendStatus(200);
    }
    else {
        next();
    }
};

function prepRefuge(refuge) {
    for (var i=0; i<refuge.length; ++i) {
        var r = refuge[i];
        refuge[i].id += '_refuge';
        refuge[i]['source'] = 'refuge';
        refuge[i]['datetime_reported'] = r.updated_at;
        refuge[i]['notes'] = r.comment;
        refuge[i]['lat'] = r.latitude;
        refuge[i]['lng'] = r.longitude;
        refuge[i]['place'] = r.name + ', ' + r.street + ', ' + r.city + ', ' + r.state + ', ' + r.country;
        refuge[i]['active'] = 1;
        refuge[i]['changing_table'] = refuge[i]['changing_table'] ? 1 : 0;
        refuge[i]['accessible'] = refuge[i]['changing_table'] ? 1 : 0;
        refuge[i]['unisex'] = refuge[i]['changing_table'] ? 1 : 0;

        delete refuge[i].name;
        delete refuge[i].street;
        delete refuge[i].city;
        delete refuge[i].state;
        delete refuge[i].comment;
        delete refuge[i].updated_at;
        delete refuge[i].created_at;
        delete refuge[i].latitude;
        delete refuge[i].longitude;
        delete refuge[i].country;
    }
    return refuge;
}

// Routes
var api = process.env.APIPATH;
var columns = ["datetime_occurred", "reports", "directions", "place", "lat", "lng",
"accessible", "changing_table", "unisex", "source", "photo"];
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET
});

// Get API info
router.get("/", function(req, res) {
    res.json({
        "Message": "This is the restroom-map API"
    });
});

// Get all reports
router.get("/reports", function(req, res) {
    var query = "SELECT * FROM ??";
    var table = ["reports"];
    query = mysql.format(query, table);
    connection.acquire(function(err, con) {
        con.query(query, function(err, rows) {
            con.release();
            if (err) {
                res.status(500).json({
                    "error": err
                });
            } else {
                request(refugeUrl + 'restrooms.json?per_page=100', function (error, response, body) {
                    if (error) {
                        console.error(error);
                        res.json({
                            "reports": rows
                        });
                    } else {
                        var refuge = prepRefuge(JSON.parse(body));
                        rows = rows.concat(refuge);
                        res.json({
                            "reports": rows
                        });
                    }
                });
            }
        });
    });
});

// Get report by id
router.get("/reports/:id", function(req, res) {
    if (req.params.id.includes('_refuge')) {
        var url = refugeUrl + 'restrooms/by_location.json?lat=30.231&lng=-97.757&per_page=100';
        request(url, function (error, response, body) {
            if (error) {
                res.status(500).json({
                    "error": err
                });
            } else {
                var refuge = prepRefuge(JSON.parse(body));
                var rows = [];
                for (var i=0; i<refuge.length; ++i) {
                    var reqid = Number(req.params.id.substring(0, req.params.id.indexOf('_')));
                    var refid = Number(refuge[i].id.substring(0, refuge[i].id.indexOf('_')));
                    if (reqid == refid) {
                        rows.push(refuge[i]);
                        break;
                    }
                }
                res.json({
                    "report": rows
                });
            }
        });
    } else {
        var query = "SELECT * FROM ?? WHERE ??=?";
        var table = ["reports", "id", req.params.id];
        query = mysql.format(query, table);
        connection.acquire(function(err, con) {
            con.query(query, function(err, rows) {
                con.release();
                if (err) {
                    res.status(500).json({
                        "error": err
                    });
                } else {
                    res.json({
                        "report": rows
                    });
                }
            });
        });
    }
});

// Get reports nearby
router.post("/reports/nearby", function(req, res) {
    var query = "SELECT *, ROUND(SQRT(POW(((69.1/1.61) * (? - ??)), 2) + POW(((53/1.61) * (? - ??)), 2)), 1) " +
        "AS distance FROM ?? HAVING distance < ? ORDER BY distance;";
    var table = [
        req.body.myLat.toString(), "lat",
        req.body.myLng.toString(), "lng",
        "reports", req.body.kmAway.toString()
    ];
    query = mysql.format(query, table);
    connection.acquire(function(err, con) {
        con.query(query, function(err, rows) {
            con.release();
            if (err) {
                res.status(500).json({
                    "error": err
                });
            } else {
                var url = refugeUrl + 'restrooms/by_location.json?lat=' + req.body.myLat + '&lng=' + req.body.myLng;
                console.log(url + '&per_page=100');
                request(url, function (error, response, body) {
                    if (error) {
                        console.error(error);
                        res.json({
                            "reports": rows
                        });
                    } else {
                        console.log('body: ' + body);
                        var refuge = prepRefuge(JSON.parse(body));
                        rows = rows.concat(refuge);
                        if (rows.length < 1) {
                            res.sendStatus(204);
                        } else {
                            res.json({
                                "reports": rows
                            });
                        }
                    }
                });
            }
        });
    });
});

// Get report by filter criteria
router.post("/reports/filter", function(req, res) {
    var query = "SELECT * FROM ??";
    var table = [
        "reports"
    ];
    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; ++i) {
        query += i ? " AND" : " WHERE";
        key = keys[i];
        value = req.body[key];
        if ("*" === key) {
            for (var j = 0; j < columns.length; ++j) {
                query += j ? " OR" : " (";
                query += " ?? LIKE ?";
                valueLike = "%" + value + "%";
                table.push(columns[j], valueLike);
            }
            query += " ) ";
        } else {
            query += " ?? LIKE ?";
            valueLike = "%" + value + "%";
            table.push(key, valueLike);
        }
    }
    query = mysql.format(query, table);
    connection.acquire(function(err, con) {
        con.query(query, function(err, rows) {
            con.release();
            if (err) {
                res.status(500).json({
                    "error": err
                });
            } else if (rows.length < 1) {
                res.sendStatus(204);
            } else {
                res.json({
                    "reports": rows
                });
            }
        });
    });
});

// Add report
router.post("/reports", function(req, res) {
    var report = req.body.reportJson;

    if (report.photo === undefined) {
        postReport();
    } else if (report.photo.length > 10) {
        cloudinary.uploader.upload(report.photo, function(result) {
            postReport(result.url);
        });
    } else {
        console.error('this doesn\'t look like a base64 image', report.photo);
        postReport();
    }

    function postReport(link) {
        var table = [];
        var query = "";
        if (link) {
            table = [
                "reports", "directions", "place", "lat", "lng",
                "accessible", "changing_table", "unisex", "source", "photo",
                report.directions, report.place, report.lat, report.lng,
                report.accessible, report.changing_table, report.unisex, report.source, link
            ];
            query = "INSERT INTO ??(??,??,??,??,??,??,??,??,??) VALUES (?,?,?,?,?,?,?,?,?)";
        } else {
            table = [
                "reports", "directions", "place", "lat", "lng",
                "accessible", "changing_table", "unisex", "source",
                report.directions, report.place, report.lat, report.lng,
                report.accessible, report.changing_table, report.unisex, report.source
            ];
            query = "INSERT INTO ??(??,??,??,??,??,??,??,??) VALUES (?,?,?,?,?,?,?,?)";
        }
        query = mysql.format(query, table);
        connection.acquire(function(err, con) {
            con.query(query, function(err, rows) {
                con.release();
                if (err) {
                    res.status(500).json({
                        "error": err
                    });
                } else {
                    res.json({
                        "report": rows
                    });
                }
            });
        });
    }
});

// Update report
router.put("/reports/:id", function(req, res) {
    var query = "UPDATE ?? SET ?? = ? WHERE ?? = ?";
    var report = req.body.reportJson;
    var table = ["reports",
        "active", report.active,
        "id", req.params.id
    ];
    query = mysql.format(query, table);
    connection.acquire(function(err, con) {
        con.query(query, function(err, rows) {
            con.release();
            if (err) {
                res.status(500).json({
                    "error": err
                });
            } else {
                res.json({
                    "report": rows
                });
            }
        });
    });
});

// Delete report by id
router.delete("/reports/:id", function(req, res) {
    var query = "DELETE from ?? WHERE ??=?";
    var table = ["reports", "id", req.params.id];
    query = mysql.format(query, table);
    connection.acquire(function(err, con) {
        con.query(query, function(err, rows) {
            con.release();
            if (err) {
                res.status(500).json({
                    "error": err
                });
            } else {
                res.json({
                    "report": rows
                });
            }
        });
    });
});

// Start server
var connection = new Connection();
var app = express();
app.use(bodyParser.urlencoded({
    limit: '10mb',
    extended: true
}));
app.use(bodyParser.json({
    limit: '10mb'
}));
app.use(allowCrossDomain);
app.use(process.env.APIPATH, router);
connection.init();
var server = app.listen(process.env.PORT, function() {
    console.log('restroom-map API listening at port ' + server.address().port);
});
