'use strict';
/**
 * Style.Tools Nginx key/value store module
 */
const client = require('./client.js');
const server = require('./server.js');

module.exports = {
    client: client,
    server: server
};