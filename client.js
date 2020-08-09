'use strict';
/**
 * Style.Tools Nginx key/value store client
 */

const request = require('request');
const cache = require('memory-cache');

// ngx-keyval class
class ngxKeyValClient {
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

        // in-memory cache
        if (typeof this.memory !== 'undefined') {
            if (!isNaN(this.memory)) {
                this.memory = {
                    "ttl": this.memory
                };
            } else if (typeof this.memory !== 'object') {
                this.memory = {
                    "enabled": 1
                };
            }
        }
        if (!this.memory) {
            this.memory = false;
        }

        if (!this.gzip) {
            this.gzip = false;
        }
    }

    // set config
    set config(config) {
        const that = this;
        ['server', 'headers', 'memory', 'gzip'].forEach(function(key) {
            if (key in config && config[key]) {
                if (typeof config[key] !== 'string') {
                    throw new APIError(key + ' not string');
                }
                that[key] = config[key];
            }
        });
    }

    // add persist header
    persist_header(headers, persist) {
        if (persist) {
            if (typeof persist === 'string') {
                persist = {
                    "bucket": persist
                };
            }
            if (typeof persist === 'object') {
                persist = JSON.stringify(persist);
            } else {
                persist = '1';
            }
            headers['x-persist'] = persist;
        }

        return headers;
    }

    // parse in-memory cache config
    memory_cache(memory) {

        let ttl;

        // in-memory cache
        if (memory || this.memory) {
            if (typeof memory === 'function') {
                memory = {
                    "verify": memory
                };
            }
            if (typeof memory !== 'object') {
                memory = {
                    "enabled": 1
                };
            }
            if (this.memory) {
                memory = Object.assign(this.memory, memory);
            }
        }

        // in-memory cache
        if (memory) {
            if (typeof memory === 'object') {
                if ("ttl" in memory) {
                    ttl = memory.ttl;
                }
            } else if (!isNaN(memory) && parseInt(memory) > 0) {
                ttl = memory;
            }

            memory.ttl = ttl;

            return memory;
        }

        return false;
    }

    // get data
    async get(key, options = {}, memory = false, persist = false) {
        const that = this;

        if (!options || Object.getPrototypeOf(options) !== Object.prototype) {
            options = {};
        }

        // in-memory cache
        memory = this.memory_cache(memory);
        if (memory) {
            let result = cache.get(key);
            if (result) {

                // verify result
                if (typeof memory.verify === 'function') {
                    result = memory.verify(result);
                }

                if (result) {
                    return result;
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
            requestOptions.headers['x-miss-ttl'] = options['miss-ttl'];
        }

        // gzip compression
        const gzip = ("gzip" in options) ? options.gzip : this.gzip;
        if (gzip) {

            // return gzip data
            if (gzip === 'raw') {
                requestOptions.headers['accept-encoding'] = 'gzip';
            } else {

                // decompress in node.js
                requestOptions.headers['gzip'] = true;
            }
        }

        // add persist header
        requestOptions.headers = that.persist_header(requestOptions.headers, persist);

        return await new Promise(function(resolve, reject) {

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

                    let result = {
                        "value": body,
                        "content-type": response.headers['content-type'],
                        "date": response.headers['date']
                    };

                    // in-memory cache
                    if (memory) {
                        cache.put(key, result, memory.ttl);
                    }

                    if (gzip) {
                        console.log(response);
                    }

                    // mark raw gzip result
                    if (gzip === 'raw' && response.headers['content-encoding'] && response.headers['content-encoding'] === 'gzip') {
                        result.gzip = true;
                    }

                    resolve(result);
                }

            });
        });
    }

    // put data
    async put(key, value, ttl, options = {}, memory = false, persist = false) {
        const that = this;

        return await new Promise(function(resolve, reject) {

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

            // gzip compression
            const gzip = ("gzip" in options) ? options.gzip : that.gzip;
            if (gzip) {

                requestOptions.headers['x-gzip'] = '1';

                // return raw gzip data (prevent gunzip decompression)
                requestOptions.headers['accept-encoding'] = 'gzip';
            }

            // add persist header
            requestOptions.headers = that.persist_header(requestOptions.headers, persist);

            // in-memory cache
            memory = that.memory_cache(memory);
            if (memory) {
                cache.put(key, {
                    "value": value,
                    "content-type": body['content-type'] || 'text/plain',
                    "date": new Date().toGMTString()
                }, memory.ttl);
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

    // delete key
    async del(key, options = {}, memory = true, persist = false) {
        const that = this;

        return await new Promise(function(resolve, reject) {

            if (!options || Object.getPrototypeOf(options) !== Object.prototype) {
                options = {};
            }

            // in-memory cache
            memory = that.memory_cache(memory);
            if (memory) {
                cache.del(key);
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

            // add persist header
            requestOptions.headers = that.persist_header(requestOptions.headers, persist);

            // custom miss TTL
            requestOptions.headers['x-delete'] = "1";

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

module.exports = ngxKeyValClient;

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