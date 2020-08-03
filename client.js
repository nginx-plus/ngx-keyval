'use strict';
/**
 * Style.Tools Nginx key/value store client
 */

const request = require('request');
const cache = require('memory-cache');

// ngx-keyval class
class NgxKeyVal {
    constructor(config) {

        // set config
        this.config = config;

        // verify
        if (!this.server) {
            throw new APIError('no ngx-keyval server in config');
        }
        if (this.server.substr(-1) !== '/') {
            this.server += '/';
        }

        // default request headers
        if (!this.headers) {
            this.headers = {};
        }
        if (typeof this.headers !== 'object') {
            throw new APIError('invalid default request headers');
        }

        if (typeof this.memory !== 'object') {
            this.memory = false;
        }
    }
    set config(config) {
        let that = this;
        ['server'].forEach(function(key) {
            if (key in config && config[key]) {
                if (typeof config[key] !== 'string') {
                    throw new APIError(key + ' not string');
                }
                that[key] = config[key];
            }
        });
    }

    // get data
    get(key, options = {}, memory = false) {
        let that = this;

        return new Promise(function(resolve, reject) {
            if (!options || Object.getPrototypeOf(options) !== Object.prototype) {
                options = {};
            }

            // try in-memory cache
            if (memory) {
                let result = cache.get(key);
                if (result) {

                    // optionally verify result 
                    if (typeof memory !== 'function' || memory(result)) {
                        return resolve(result);
                    }
                }
            }

            let requestOptions = {
                url: that.server + key
            };

            requestOptions.headers = {};
            if (that.headers) {
                Object.assign(requestOptions.headers, that.headers);
            }
            if ("headers" in options && typeof options.headers === 'object') {
                Object.assign(requestOptions.headers, options.headers);
            }

            // custom miss TTL
            if ("miss-ttl" in options && options['miss-ttl']) {
                requestOptions.headers['X-Miss-Ttl'] = options['miss-ttl'];
            }

            request(requestOptions, function(err, response, body) {

                if (err) {
                    throw new InternalServerError(err);
                } else if (response.statusCode === 400) {
                    throw new BadRequest(body);
                } else if (response.statusCode === 403) {
                    throw new Unauthorized(body);
                } else if (response.statusCode === 429) {
                    throw new RateLimitException(body);
                } else if (response.statusCode === 500 || response.statusCode === 504) {
                    throw new InternalServerError(body);
                } else if (response.statusCode === 404 || response.statusCode === 204) {

                    // not found (404) or just deleted (204)
                    resolve(null);
                } else if (response.statusCode !== 200) {
                    console.log(response.statusCode, body);
                    throw new APIError(body);
                } else {

                    resolve({
                        "value": body,
                        "content-type": response.headers['content-type']
                    })
                }

            });
        });
    }

    // put data
    put(key, value, ttl, options = {}, memory = false) {
        let that = this;

        return new Promise(function(resolve, reject) {

            if (!options || Object.getPrototypeOf(options) !== Object.prototype) {
                options = {};
            }

            if (!ttl || isNaN(ttl) || parseInt(ttl) <= 0) {
                throw new APIError('Invalid TTL');
            }

            if (typeof value !== 'string') {
                value = JSON.stringify(value);
            }

            let body = Object.assign(options, {
                value: value,
                ttl: ttl
            });

            let requestOptions = {
                url: that.server + key,
                method: "POST",
                json: true,
                body: body
            };

            requestOptions.headers = {};
            if (that.headers) {
                Object.assign(requestOptions.headers, that.headers);
            }
            if ("headers" in options && typeof options.headers === 'object') {
                Object.assign(requestOptions.headers, options.headers);
            }

            // in-memory cache
            if (memory) {
                let mem_ttl;

                if (typeof that.memory === 'object') {
                    if ("ttl" in that.memory) {
                        mem_ttl = that.memory.ttl;
                    }
                } else if (!isNaN(that.memory) && parseInt(that.memory) > 0) {
                    mem_ttl = that.memory;
                }
                if (typeof memory === 'object') {
                    if ("ttl" in memory) {
                        mem_ttl = memory.ttl;
                    }
                } else if (!isNaN(memory) && parseInt(memory) > 0) {
                    mem_ttl = memory;
                }

                cache.put(key, {
                    "value": value,
                    "content-type": body['content-type'] || 'text/plain'
                }, mem_ttl || undefined);
            }

            request(requestOptions, function(err, response, body) {

                if (err) {
                    throw new InternalServerError(err);
                } else if (response.statusCode === 400) {
                    throw new BadRequest(body);
                } else if (response.statusCode === 403) {
                    throw new Unauthorized(body);
                } else if (response.statusCode === 429) {
                    throw new RateLimitException(body);
                } else if (response.statusCode === 500 || response.statusCode === 504) {
                    throw new InternalServerError(body);
                } else if (response.statusCode !== 200) {
                    throw new APIError(body);
                } else {

                    resolve();
                }

            });
        });
    }

    del(key, options = {}) {
        let that = this;

        return new Promise(function(resolve, reject) {

            if (Object.getPrototypeOf(options) !== Object.prototype) {
                options = {};
            }

            // memory cache
            cache.del(key);

            let requestOptions = {
                url: that.server + key
            };

            requestOptions.headers = {};
            if (that.headers) {
                Object.assign(requestOptions.headers, that.headers);
            }
            if ("headers" in options && typeof options.headers === 'object') {
                Object.assign(requestOptions.headers, options.headers);
            }

            // custom miss TTL
            requestOptions.headers['X-Delete'] = "1";

            request(requestOptions, function(err, response, body) {

                if (err) {
                    throw new InternalServerError(err);
                } else if (response.statusCode === 400) {
                    throw new BadRequest(body);
                } else if (response.statusCode === 403) {
                    throw new Unauthorized(body);
                } else if (response.statusCode === 429) {
                    throw new RateLimitException(body);
                } else if (response.statusCode === 500 || response.statusCode === 504) {
                    throw new InternalServerError(body);
                } else if (response.statusCode !== 204) {
                    throw new APIError(body);
                } else {

                    resolve()
                }

            });
        });
    }
}

module.exports = NgxKeyVal;

// error handlers
class APIError extends Error {};

// HTTP Status 400
class BadRequest extends APIError {};
class CredentialsMissing extends BadRequest {};
class BadEnvironment extends BadRequest {};

// HTTP Status 401
class Unauthorized extends APIError {};
class BadCredentials extends Unauthorized {};
class BadAuthToken extends Unauthorized {};
class AccountBlocked extends Unauthorized {};
class IpAddressIsNotAllowed extends Unauthorized {};

// HTTP Status 429
class RateLimitException extends APIError {};

// HTTP Status 500, 504
class InternalServerError extends APIError {};