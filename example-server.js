/**
 * Style.Tools Nginx key/value store server
 */
const ngxKeyVal = require('@style.tools/ngx-keyval');

// initiate key/value store
const server = new ngxKeyVal.server({
    "port": 14451,
    "verbose": false,
    "default_ttl": false,
    "miss_ttl": 1,
    "max_size": "50mb",
    "default_content_type": "text/plain",
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