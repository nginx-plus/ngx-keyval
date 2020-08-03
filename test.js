'use strict';
/**
 * Style.Tools Nginx key/value store client
 */

// Nginx key/val controller
const NgxKeyVal = require('./client.js');

// load key/val store
const NKV = new NgxKeyVal({
    "server": "http://kv.style.tools/"
});

async function test() {

    console.log('get: xxx');
    let x = await NKV.get('xxx').catch(function() {
        console.error(11234);
    })
    console.log('result:', x);

    console.log('set: xxx with 5 second TTL');
    x = await NKV.put('xxx', 'test123 456', 5);

    console.log('get: xxx');
    x = await NKV.get('xxx');
    console.log('result:', x);

    console.log('wait 6 seconds');
    setTimeout(async function() {

        console.log('get: xxx');
        x = await NKV.get('xxx');
        console.log('result:', x);

        console.log('set: xxx');
        x = await NKV.put('xxx', 'test123 456', 20);

        for (let i = 0, l = 10; i < l; i++) {
            console.time('get');
            x = await NKV.get('xxx');
            console.timeEnd('get');
        }

        console.log('set + memory: xxx');
        x = await NKV.put('xxx', 'test123 456', 20, {}, true);

        for (let i = 0, l = 10; i < l; i++) {
            console.time('get');
            x = await NKV.get('xxx', null, true);
            console.timeEnd('get');
        }

        x = await NKV.get('xxx');
        console.log('result:', x);

        console.log('delete: xxx');
        x = await NKV.delete('xxx');

        console.log('get: xxx');
        try {
            x = await NKV.get('xxx', null, true);
        } catch (e) {
            console.error(e);
        }

        console.log('result:', x);

    }, 6000);


}

test();