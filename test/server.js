/** Nginx key/value store Tests */

const path = require('path');
const ngxKeyVal = require(path.resolve(__dirname, '../index.js'));

// initiate key/value store
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