/**
 * Style.Tools Nginx key/value management server
 */

// ngx-keyval server class
class ngxKeyValServer {
    constructor(config) {

        const pack = require('./package.json');

        // set config
        this.config = config;
        this.version = pack.version;
    }

    // verify config
    set config(config) {

        let that = this;
        ['port', 'default_content_type', 'miss_ttl', 'default_ttl', 'persist', 'verbose'].forEach(function(key) {

            // prefix key
            let localkey = key;
            if (['persist', 'verbose'].indexOf(key) !== -1) {
                localkey = '_' + key;
            }

            if (key in config && config[key]) {
                that[localkey] = config[key];
            } else {
                switch (key) {
                    case "miss_ttl":
                    case "default_ttl":
                        that[localkey] = 0;
                        break;
                    case "persist":
                        that[localkey] = false;
                        break;
                    case "default_content_type":
                        that[localkey] = 'plain/text';
                        break;
                }

            }
        });

        // server port
        if (!this.port || isNaN(this.port)) {
            throw new ServerError('invalid server port');
        }

        // persistent storage
        if (typeof this._persist !== 'object') {
            this._persist = false;
        }
        if (this._persist) {
            if (this._persist.enabled === 'always') {
                this._persist.enabled = true;
            }
            if (this._persist.enabled === false || this._persist.enabled === 'false') {
                this._persist = false;
            }
        }
    }

    // start server
    start() {

        const that = this;
        const express = require('express');
        const app = express();
        app.disable('x-powered-by');
        app.disable('etag');
        app.use(express.json({
            type: '*/*'
        }));

        // key/value request
        app.all('/:key', (req, res) => {

            // PUT
            if (req.method === 'POST') {
                that.put(req, res);
            } else if (req.header('x-delete')) { // DELETE
                that.del(req, res);
            } else {

                // 404 request
                that.get(req, res);
            }
        });

        // start server
        app.listen(this.port, () => {
            that.log('START', 'port ' + that.port);
        });
    }

    // load
    log() {
        let data = [].slice.call(arguments);
        console.log("ngx.keyval | " + data.join(' | '));
    }

    // verbose
    verbose(key) {
        if (this._verbose === true || this._verbose === "true") {
            return true;
        } else if (typeof this._verbose === 'object' && key in this._verbose && this._verbose[key]) {
            return true;
        }

        return false;
    }

    // persist
    persist(persist) {

        if (!this._persist) {
            return false;
        }

        if (!persist && this._persist.enabled === true) {
            persist = true;
        }

        if (persist) {

            // JSON
            if (typeof persist === 'string' && persist.substr(0, 1) === '{') {
                try {
                    persist = JSON.parse(persist);
                } catch (e) {
                    persist = false;

                    if (this.verbose('persist')) {
                        this.log('PERSIST', 'ERROR', e);
                    }
                }
            } else {
                persist = true;
            }
        }

        if (!persist) {
            return false;
        }

        if (persist === true) {
            persist = {};
        }

        persist = Object.assign(Object.assign({}, this._persist), persist);

        if (typeof persist.bucket !== 'string') {
            throw new ServerError('no bucket');
        }

        return persist;
    }

    // headers
    headers(res, ttl) {
        res.setHeader("Server", "ngx-keyval/" + this.version);

        if (ttl && !isNaN(ttl)) {
            ttl = parseInt(ttl);
            res.setHeader("Date", new Date(Date.now() + ttl).toUTCString());
            res.setHeader("X-Accel-Expires", ttl);
        }
    }

    // file size
    filesize(fileSizeInBytes) {
        let i = -1;
        let byteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
        do {
            fileSizeInBytes = fileSizeInBytes / 1024;
            i++;
        } while (fileSizeInBytes > 1024);

        return Math.max(fileSizeInBytes, 0.1).toFixed(1) + byteUnits[i];
    }

    // init persistent store
    async init_persistent_store(persist) {

        // init storage
        if (!this.storage) {
            const {
                Storage
            } = require('@google-cloud/storage');

            this.storage = new Storage(persist.auth || undefined);

            // google cloud storage buckets
            this.buckets = {};
        }

        // bucket
        const bucket = persist.bucket;
        if (!bucket) {
            return;
        }

        if (!(bucket in this.buckets)) {
            this.buckets[bucket] = this.storage.bucket(bucket);
        }

        return this.buckets[bucket];
    }

    // get request
    async get(req, res) {
        const that = this;

        // verbose
        if (this.verbose('get')) {
            this.log('GET', req.params.key)
        }

        // miss TTL
        const miss_ttl = req.header('x-miss-ttl');
        const ttl = (!isNaN(miss_ttl) && parseInt(miss_ttl) >= 0) ? miss_ttl : this.miss_ttl;

        // persist store
        const persist = this.persist(req.header('x-persist'));

        // try persist store
        if (persist) {

            const persisted = await this.get_persist(req, res, persist).catch(function(e) {
                that.log('PERSIST', 'ERROR', persist.bucket, 'GET', req.params.key, e);
            });
            if (persisted) {
                return;
            }
        }

        // return 404 not-exist response
        this.headers(res, ttl);
        res.sendStatus(404);
    }

    // get from persistent store
    async get_persist(req, res, persist) {

        const store = await this.init_persistent_store(persist);

        // no storage / bucket
        if (!store) {
            return false;
        }

        // retrieve file
        const file = store.file(req.params.key);

        // check if exists
        const exists = await file.exists();
        if (!exists || !exists[0]) {

            // verbose
            if (this.verbose('persist')) {
                this.log('PERSIST', persist.bucket, 'GET', req.params.key, null);
            }

            return false;
        }

        const data = await file.download();
        let contents = data[0];
        if (contents) {

            // verbose
            if (this.verbose('persist')) {
                this.log('PERSIST', persist.bucket, 'GET', req.params.key, this.filesize(contents.length));
            }

            try {
                contents = JSON.parse(contents);
            } catch (e) {

                // verbose
                if (this.verbose('persist')) {
                    this.log('PERSIST', 'ERROR', persist.bucket, 'GET', req.params.key, 'data returned from persistent store not json', e);
                }
                return false;
            }

            // replicate PUT request
            req.body = contents;
            this.put(req, res, true);

            return true;
        }

        return false;
    }

    // put request
    put(req, res, noPersist = false) {
        const that = this;

        // data
        let data = req.body,
            ttl, content_type;

        // verify
        if (typeof data !== 'object' || !("value" in data) || typeof data.value !== 'string') {

            // verbose
            if (this.verbose('put')) {

                if (this.verbose('put')) {
                    this.log('PUT', 'ERROR', req.params.key, 'invalid data');
                }
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
            if (this.default_ttl && !isNaN(this.default_ttl)) {
                ttl = parseInt(this.default_ttl);
            } else {

                // verbose
                if (this.verbose('put')) {
                    this.log('PUT', 'ERROR', req.params.key, 'invalid ttl');
                }

                res.status(400).send('no_ttl');
                return;
            }
        }

        // content type
        content_type = this.default_content_type || 'plain/text';
        if ("content-type" in data && typeof data['content-type'] === 'string' && data['content-type']) {
            content_type = data['content-type'];
        }

        // verbose
        if (this.verbose('put')) {
            this.log('PUT', req.params.key, ttl, this.filesize(data.value.length));
        }

        // persist store
        if (!noPersist) {
            const persist = this.persist(req.header('x-persist'));
            if (persist) {

                // do not wait
                this.put_persist(req, res, data, persist).catch(function(e) {
                    that.log('PERSIST', 'ERROR', persist.bucket, 'PUT', req.params.key, e);
                });
            }
        }

        // set cache headers
        this.headers(res, ttl);

        res.setHeader('Content-Type', content_type);
        res.status(200);
        res.send(data.value);
    }

    // put to persistent store
    async put_persist(req, res, data, persist) {

        const store = await this.init_persistent_store(persist);

        // no storage / bucket
        if (!store) {
            return false;
        }

        // verbose
        if (this.verbose('persist')) {
            this.log('PERSIST', persist.bucket, 'PUT', req.params.key, this.filesize(data.value.length));
        }

        let upload_options = this._persist.upload_options || {};

        // save file
        await store.file(req.params.key).save(JSON.stringify(data), upload_options);
    }

    // delete request
    async del(req, res) {
        const that = this;

        // verbose
        if (this.verbose('delete')) {
            this.log('DELETE', req.params.key);
        }

        // persist store
        const persist = this.persist(req.header('x-persist'));
        if (persist) {

            // do not wait
            await this.del_persist(req, res, persist).catch(function(e) {
                that.log('PERSIST', 'ERROR', persist.bucket, 'DELETE', req.params.key, e);
            });
        }

        // expire in 1 second  to delete
        this.headers(res, 1);
        res.sendStatus(204);
    }

    // delete from persistent store
    async del_persist(req, res, persist) {

        const store = await this.init_persistent_store(persist);

        // no storage / bucket
        if (!store) {
            return false;
        }

        // verbose
        if (this.verbose('persist')) {
            this.log('PERSIST', persist.bucket, 'DELETE', req.params.key);
        }

        const file = store.file(req.params.key);

        // delete file
        try {
            await file.delete();
        } catch (e) {
            // ignore
        }

    }
}

module.exports = ngxKeyValServer;

// error handlers
class APIError extends Error {};

// HTTP Status 400
class ServerError extends APIError {};
class BadRequest extends APIError {};
class PersistServerError extends ServerError {};

// HTTP Status 500, 504
class InternalServerError extends APIError {};