[![Build Status](https://travis-ci.com/style-tools/ngx-keyval.svg?branch=master)](https://travis-ci.com/style-tools/ngx-keyval) [![Version](https://img.shields.io/github/release/style-tools/ngx-keyval.svg)](https://github.com/style-tools/ngx-keyval/releases) [![npm version](https://badge.fury.io/js/%40style.tools%2Fngx-keyval.svg)](http://badge.fury.io/js/%40style.tools%2Fngx-keyval)

# ngx-keyval - Nginx key/value store

A simple high performance and scalable key/value store with TTL based on Nginx `proxy_cache` with a Node.js client that ads an extra in-memory cache layer with an independent TTL.

The Nginx key/value store can be used via Curl or a simple HTTP request. The Nginx key/value store can be used in a browser using simple Fetch API requests.

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
const NKV = new ngxKeyVal({
    "server": "http://your-keyval-store.local/"
});

// get data
let data = await NKV.get('key');

// set data with an 1 hour expire time
await NKV.put('key', 'data', 60 * 60);

// set data with an 1 hour expire time, a custom content-type and a 10 seconds in-memory cache
await NKV.put('key', 'data', 60 * 60, {
   "content-type": "application/json"
}, 10);

// delete key
await NKV.del('key');
```

# Install via npm

```bash
npm install @style.tools/ngx-keyval --save
```

## Step 1: setup the Nginx key/value server

The server configuration in server.conf provides an example. You may need to tune the settings of the proxy_cache, the server name and the security settings (IP restriction). 

## Step 2: setup the Node.js key/value management server

The key/value store uses a Node.js server as a cache management controller that is used by Nginx as an upstream. 

The file server.js contains a default server that can be configured via the settings in package.json#server. You can start the server using forever.

```bash
forever start --uid "ngx-keyval" -a /home/path/to/ngx-keyval/server.js
```

Update the Nginx server configuration with the correct IP and port of the Node.js server.
