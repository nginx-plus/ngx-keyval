'use strict';
/**
 * Style.Tools Nginx key/value store client
 */

// Nginx key/val controller
const ngxKeyVal = require('./index.js');

// load key/val store
const store = new ngxKeyVal.client({
    "server": "http://kv.style.tools/"
});

async function test() {
    await store.del('xxx');
    //return;
    await store.put('xxx', 'test data asd asd asd asd asd asdasd asdas', 10, {
        gzip: true
    });


}

test();