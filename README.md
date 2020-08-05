[![Build Status](https://travis-ci.com/style-tools/ngx-keyval.svg?branch=master)](https://travis-ci.com/style-tools/ngx-keyval) [![Version](https://img.shields.io/github/release/style-tools/ngx-keyval.svg)](https://github.com/style-tools/ngx-keyval/releases) [![npm version](https://badge.fury.io/js/%40style.tools%2Fngx-keyval.svg)](http://badge.fury.io/js/%40style.tools%2Fngx-keyval)

# ngx-keyval - Nginx key/value store

A simple high performance and scalable key/value store with TTL based on Nginx `proxy_cache` with a Node.js client that ads an extra in-memory cache layer with an independent TTL. The solution provides an option to use [Google Cloud Storage](https://cloud.google.com/storage) to secure data persistency.

The Nginx key/value store can be used via Curl or a simple HTTP request and can be used in a browser using Fetch API requests.

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
const ngxKeyValClient = require('@style.tools/ngx-keyval');

// initiate key/value store
const store = new ngxKeyValClient({
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

// set data with an 1 hour expire time, a custom content-type and a 10 seconds in-memory cache
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


/** Google Cloud Storage peristence examples **/

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

The file [server.js](https://github.com/style-tools/ngx-keyval/blob/master/server.js) contains a default server that can be configured via the settings in [package.json#server](https://github.com/style-tools/ngx-keyval/blob/master/package.json). You can start the server using forever.

```bash
forever start --uid "ngx-keyval" -a /home/path/to/ngx-keyval/server.js
``` 

Update the Nginx server configuration with the correct IP and port of the Node.js server.

---

# Persistent storage via Google Cloud Storage

Nginx `proxy_cache` has a hard cache size limit and automatically removes least accessed entries when the cache limit is reached. To secure data persistency, the solution provides the option to use a [Google Cloud Storage](https://cloud.google.com/storage) bucket as a fallback.

To use the Google Cloud Storage bucket you need to configure `persist` in [package.json#server](https://github.com/style-tools/ngx-keyval/blob/master/package.json).

```json
{
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
```

## Retrieving/storing persistent data

The Google Cloud Storage bucket can be enabled by default or based on a HTTP header.

The value `persist#enabled` in [package.json#server](https://github.com/style-tools/ngx-keyval/blob/master/package.json) accepts three values:

- false
- always
- header

When set to `header`, it is required to set the `x-persist:1` header in the GET or POST request to enable the Google Cloud Storage bucket. It is possible to define the bucket using a JSON value: `x-persist:{"bucket": "bucket-name"}`.

# Description

The solution (Nginx key/value server + Node.js client) provides three cache layers for optimal performance and reliability.

- in-memory cache ([memory-cache](https://github.com/ptarjan/node-cache)) with an independent TTL
- Nginx key/value server
- Google Cloud Storage (persistency)

Nginx TTL management is fast and efficient and the server supports gigabytes of data with optimal performance.

The idea for the solution arose when MongoDB regularly crashed or caused a heavy load on the server with gigabytes of frequently accessed key/value data while the use of Google Cloud services would introduce a higher latency and significant costs.

The Nginx key/value server is a reliable and high performance solution that can handle high traffic.

## Bottleneck

The Node.js management server that is used by the Nginx key/value server should not receive much traffic. It is possible to define a TTL for non existent (404) keys, both on request level (`x-miss-ttl` header) and on server level, so that Nginx will handle the load of any GET request related traffic. For PUT request related traffic the Node.js management server can become a bottle neck.

If the key/value server is to receive lots of traffic for non-existent keys with unique names, then the Node.js management server will become a bottle neck.