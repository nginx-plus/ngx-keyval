[![Build Status](https://travis-ci.com/style-tools/ngx-keyval.svg?branch=master)](https://travis-ci.com/style-tools/ngx-keyval) [![Version](https://img.shields.io/github/release/style-tools/ngx-keyval.svg)](https://github.com/style-tools/ngx-keyval/releases) [![npm version](https://badge.fury.io/js/%40style.tools%2Fngx-keyval.svg)](http://badge.fury.io/js/%40style.tools%2Fngx-keyval)

# ngx-keyval - Nginx key/value store

A simple high performance and scalable key/value store with TTL based on Nginx `proxy_cache` with a Node.js client that ads an optional extra in-memory cache layer. The solution provides an option to use [Google Cloud Storage](https://cloud.google.com/storage) as backup.

The Nginx key/value store can be used via a simple HTTP request. Nginx allows advanced security and authentication that could enable public usage in a web application. The store enables to set HTTP headers and a `content-type` so that keys can be accessed as regular file URLs, e.g. `your-key-value-store.local/filename.json`.

Nginx `proxy_cache` supports gigabytes of data per key and millions of keys with optimal performance. It is possible to access data in keys using a `range` request to return a small part of a gigabyte size key, with high performance (managed by Nginx).

```bash
# get data
curl -D - http://your-keyvalue-store.local/key

# set data with a 1 hour TTL
curl -D - -H "Content-Type: application/json" -X POST -d '{"value": "data", "ttl": 3600}' http://your-keyvalue-store.local/key

# delete key
curl -D - -H "X-DELETE:1" http://your-keyvalue-store.local/key
```

The Node.js client provides an easy API.

```javascript
const ngxKeyVal = require('@style.tools/ngx-keyval');

// initiate key/value store
const store = new ngxKeyVal.client({
    "server": "http://your-keyvalue-store.local/"
});

// get data
let data = await store.get('key');

// set data with an 1 hour expire time
await store.put('key', 'data', 60 * 60);

// delete key
await store.del('key');


/** options example **/

// get data with custom miss-ttl and HTTP headers
let data = await store.get('key', {
   "miss-ttl": 3600, // cache non-existent key requests in Nginx for 1 hour
   "headers": {
      "X-Authenticate-Me": "secret"
   }
});


/** in-memory examples **/

// set data with a custom content-type and a 10 seconds in-memory cache
await store.put('key', 'data', 60 * 60, {
   "content-type": "application/json"
}, 10);

// get data from memory (memory is not used by default)
let data = await store.get('key', null, true);

// get data from memory with a result verification function
let data = await store.get('key', null, function(data) {
   
   // data retrieved from memory

   // modify result
   data.verified = 'OK';
   return data;

   // do not use cached result
   // return false;
});


/** Google Cloud Storage backup examples **/

// set data with persistent storage in Google Cloud Storage
await store.put('key', 'data', 60 * 60, false, true);

// set data with persistent storage in a custom Google Cloud Storage bucket
await store.put('key', 'data', 60 * 60, false, 'bucket-name');

// get data with persistent storage fallback
let data = await store.get('key', null, false, true);

// delete data from persistent storage
await store.del('key', null, false, true);
```

# Installation

```bash
npm install @style.tools/ngx-keyval --save
```

## Step 1: setup the Nginx key/value store server

The server configuration in [server.conf](https://github.com/style-tools/ngx-keyval/blob/master/server.conf) provides an example. You may need to tune the settings of the proxy_cache, the server name and the security settings (IP restriction). 

## Step 2: setup the Node.js key/value store management server

The key/value store uses a Node.js server as a management controller that is used by Nginx as an upstream. 

```javascript
const ngxKeyVal = require('@style.tools/ngx-keyval');

// initiate key/value server
const server = new ngxKeyVal.server({
    "port": 14451,
    "verbose": true,
    "default_ttl": false,
    "miss_ttl": 1,
    "default_content_type": "plain/text",
    "persist": {
        "type": "@google-cloud/storage",
        "auth": {
            "projectId": "optimization",
            "keyFilename": "service-account-key.json"
        },
        "bucket": "ngx-keyval-test",
        "upload_options": {
            "gzip": true
        },
        "enabled": "header"
    }
});

// start server
server.start();
```

You can start the server using forever.

```bash
forever start --uid "ngx-keyval" -a /home/path/to/server.js
``` 

Update the Nginx server configuration with the correct IP and port of the Node.js server.

```nginx
# key/val management server
upstream ngx-keyval-server {
  server  127.0.0.1:14451;
}
```

---

# Backup via Google Cloud Storage

Nginx `proxy_cache` has a hard cache size limit and automatically removes least accessed entries when the cache limit is reached. The solution provides the option to use a [Google Cloud Storage](https://cloud.google.com/storage) bucket as backup.

To use the Google Cloud Storage bucket you need to configure `persist` parameter in the Node.js server configuration (see above).

## Retrieving/storing persistent data

The Google Cloud Storage bucket can be enabled by default or based on a HTTP header.

The parameter `persist#enabled` accepts three values:

- false
- always
- header

When set to `header`, it is required to set the `x-persist:1` header in the GET or POST request to enable the Google Cloud Storage bucket. It is possible to define the bucket using a JSON value: `x-persist:{"bucket": "bucket-name"}`.

# Description

The solution (Nginx key/value server + Node.js client) provides three cache layers for optimal performance and reliability.

- in-memory cache ([memory-cache](https://github.com/ptarjan/node-cache)) with an independent TTL
- Nginx key/value server
- Google Cloud Storage backup

Nginx TTL management is fast and efficient and the server supports gigabytes of data with optimal performance.

## Bottleneck

The Node.js management server is used for non-existent key requests and PUT requests. It is possible to define a TTL for non existent (404) keys, both on request level (`x-miss-ttl` header) and on server level, so that Nginx will handle the load of any GET request related traffic. For PUT request related traffic the Node.js management server can become a bottle neck.

If the key/value server is to receive lots of traffic for non-existent keys with unique names, then the Node.js management server can become a bottle neck.

To overcome the Node.js bottleneck, it is possible to use a [Google Cloud Function](https://cloud.google.com/functions) or a server pool as Node.js upstream. A Cloud Function can handle any traffic but introduces a latency (for non-existent keys and PUT requests only) and costs.

```nginx
# key/val management server
upstream ngx-keyval-server {
  server us-central1-ngx-keyval-12345.cloudfunctions.net:443;

  # server pool
  # server server-2;
  # server server-3;
  # server server-4;
}
```

The functionality of the Node.js management server is very simple. It will merely return the data that is sent by Nginx and modify the cache headers. It is therefor easy to scale the server.
