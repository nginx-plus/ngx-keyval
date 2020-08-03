/**
 * Style.Tools Nginx key/value store server
 */

const pack = require('./package.json');
const express = require('express');
//const bodyParser = require('body-parser');

const app = express();
app.disable('x-powered-by');
app.disable('etag');
app.use(express.json({
    type: '*/*'
}));

// expires header
function kv_headers(res, ttl) {
    res.setHeader("Server", "ngx-keyval/" + pack.version);

    if (ttl && !isNaN(ttl)) {
        ttl = parseInt(ttl);
        res.setHeader("Date", new Date(Date.now() + ttl).toUTCString());
        res.setHeader("X-Accel-Expires", ttl);
    }
}

// set data
function kv_put(req, res) {

    // data
    let data = req.body,
        ttl, content_type;

    // verify
    if (typeof data !== 'object' || !("value" in data) || typeof data.value !== 'string') {

        // verbose
        if (verbose('put')) {
            let debug = 'ngx.keyval | ERROR | PUT | ' + req.params.key + ' | invalid data';
            console.log(debug);
        }

        res.status(400).send('no_data');
        return;
    }

    // TTL
    if ("ttl" in data) {
        ttl = parseInt(data.ttl);
        if (isNaN(ttl) || ttl <= 0) {
            ttl = false;
        }
    }
    if (!ttl) {

        // try default ttl
        if (pack.server.default_ttl && !isNaN(pack.server.default_ttl)) {
            ttl = parseInt(pack.server.default_ttl);
        } else {

            // verbose
            if (verbose('put')) {
                let debug = 'ngx.keyval | ERROR | PUT | ' + req.params.key + ' | no ttl';
                console.log(debug);
            }

            res.status(400).send('no_ttl');
            return;
        }
    }

    // content type
    content_type = pack.server.default_content_type || 'plain/text';
    if ("content-type" in data && data['content-type']) {
        content_type = data['content-type'];
    }

    // verbose
    if (verbose('put')) {
        let debug = 'ngx.keyval | PUT | ' + req.params.key;
        if (ttl) {
            debug += ' | TTL: ' + ttl;
        }
        debug += ' | ' + filesize(data.value.length);
        console.log(debug);
    }

    // set cache headers
    kv_headers(res, ttl);

    res.setHeader('Content-Type', content_type);
    res.status(200);
    res.send(data.value);
}

// get request (404 / not found)
function kv_get(req, res) {

    // verbose
    if (verbose('get')) {
        let debug = 'ngx.keyval | GET | ' + req.params.key;
        console.log(debug);
    }

    let ttl = pack.server.miss_ttl || 0;

    // custom miss TTL override
    let miss_ttl = req.header('x-miss-ttl');
    if (!isNaN(miss_ttl) && parseInt(miss_ttl) >= 0) {
        ttl = req.header('x-miss-ttl');
    }

    // cache 404
    kv_headers(res, ttl);

    res.sendStatus(404);
}

// delete data
function kv_delete(req, res) {

    // verbose
    if (verbose('delete')) {
        let debug = 'ngx.keyval | DELETE | ' + req.params.key;
        console.log(debug);
    }

    // expire in 1 second  to delete
    kv_headers(res, 1);

    res.sendStatus(204);
}

// human readable file size
function filesize(fileSizeInBytes) {
    var i = -1;
    var byteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
    do {
        fileSizeInBytes = fileSizeInBytes / 1024;
        i++;
    } while (fileSizeInBytes > 1024);

    return Math.max(fileSizeInBytes, 0.1).toFixed(1) + byteUnits[i];
};

// verbose setting
function verbose(key) {
    if (pack.server.verbose === true || pack.server.verbose === "true") {
        return true;
    } else if (typeof pack.server.verbose === 'object' && key in pack.server.verbose && pack.server.verbose[key]) {
        return true;
    }

    return false;
}

// key/value request
app.all('/:key', (req, res) => {

    // PUT
    if (req.method === 'POST') {
        kv_put(req, res);
    } else if (req.header('x-delete')) { // DELETE
        kv_delete(req, res);
    } else {

        // 404 request
        kv_get(req, res);
    }
});

// start server
app.listen(pack.server.port, () => {
    console.log("ngx.keyval | START | server listening on " + pack.server.port);
});