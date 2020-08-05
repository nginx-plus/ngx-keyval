/** Nginx key/value store Tests */

const assert = require('assert'),
    path = require('path'),
    fs = require('fs'),
    md5 = require('md5'),
    ngxKeyVal = require(path.resolve(__dirname, '../../client.js')),
    microBenchmark = require('micro-benchmark');

let store;

describe('Nginx key/val client tests', async function() {

    // setup clie
    before(function(done) {

        // create tmp directory
        try {
            fs.mkdirSync(path.resolve(__dirname, '../tmp/'));
        } catch (e) {

        }

        done();
    });

    it('Initiates key/value client', function(done) {

        // load key/val store
        store = new ngxKeyVal({
            "server": "http://localhost/"
        });

        assert.equal(typeof store, 'object');
        done();
    });

    it('Exposes get(), put() and del() methods', function(done) {
        assert.equal(typeof store.get, 'function');
        assert.equal(typeof store.put, 'function');
        assert.equal(typeof store.del, 'function');
        done();
    });

    it('Get non-existing key', function(done) {

        store.get('xxx').then(function(result) {

            assert.equal(result, null);
            done();
        });
    });

    it('Set key with 2 second TTL', function(done) {

        store.put('xxx', 'test data', 2).then(function() {
            store.get('xxx').then(function(result) {

                assert.equal((typeof result === 'object' && result !== null && result.value === 'test data'), true);
                done();
            });
        });
    });

    it('Get expired key after 2 second TTL', function(done) {

        this.timeout(5000);

        setTimeout(function() {
            store.get('xxx').then(function(result) {

                assert.equal(result, null);
                done();

            });

        }, 3000); // 2.2 seconds

    });

    it('Delete key', function(done) {

        this.timeout(5000);

        store.put('xxx', 'test data', 10).then(function() {
            store.get('xxx').then(function(result) {

                assert.equal((typeof result === 'object' && result !== null && result.value === 'test data'), true);

                store.del('xxx').then(function(result) {

                    store.get('xxx').then(function(result) {

                        assert.equal(result, null);
                        done();
                    });
                });
            });
        });
    });

    it('Get key with memory storage (1 second TTL)', function(done) {

        this.timeout(5000);

        console.log("\n");

        store.put('xxx', 'test data', 10).then(async function() {

            var result = microBenchmark.suiteAsync({
                maxOperations: 1000,
                specs: [{
                    name: 'nginx',
                    fn: function(cb) {

                        store.get('xxx').then(function(result) {

                            assert.equal((typeof result === 'object' && result !== null && result.value === 'test data'), true);
                            cb();
                        });
                    }
                }]
            }, function(result) {

                // print benchmark results
                var report = microBenchmark.report(result, {
                    chartWidth: 10
                });
                console.log(report);

                store.del('xxx').then(function(result) {

                    store.put('xxx', 'test data', 10, null, 10).then(async function() {

                        var result = microBenchmark.suiteAsync({
                            maxOperations: 1000,
                            specs: [{
                                name: 'in-memory',
                                fn: function(cb) {

                                    store.get('xxx', null, true).then(function(result) {

                                        assert.equal((typeof result === 'object' && result !== null && result.value === 'test data'), true);
                                        cb();
                                    });
                                }
                            }]
                        }, function(result) {

                            // print benchmark results
                            var report = microBenchmark.report(result, {
                                chartWidth: 10
                            });
                            console.log("\n");
                            console.log(report);
                            console.log("\n");

                            // require at least 5000 per second
                            assert.equal(result[0].ops > 5000, true);

                            done();

                        });

                    });
                });


            });

        });

    });


    it('Set key with persistent storage in Google Cloud', function(done) {

        this.timeout(10000);

        store.put('xxx', 'test data', 2, null, false, true).then(function() {

            // delete nginx cache data
            store.del('xxx').then(function(result) {

                // verify deletion from nginx
                store.get('xxx').then(function(result) {

                    assert.equal(result, null);

                    // wait for Google Cloud data-transfer to complete in background
                    setTimeout(function() {

                        // get from persistent storage
                        store.get('xxx', null, false, true).then(function(result) {

                            assert.equal((typeof result === 'object' && result !== null && result.value === 'test data') ? true : result, true);
                            done();
                        });

                    }, 5000);

                });

            });
        });
    });

    it('Delete key from persistent storage in Google Cloud', function(done) {

        this.timeout(10000);

        // get from persistent storage
        store.get('xxx', null, false, true).then(function(result) {

            assert.equal((typeof result === 'object' && result !== null && result.value === 'test data') ? true : result, true);

            // delete from persistent storage
            store.del('xxx', null, false, true).then(function(result) {

                // verify deletion
                store.get('xxx', null, false, true).then(function(result) {

                    assert.equal(result, null);
                    done();
                });

            });

        });

    });

    after(function(done) {

        store.del('xxx', null, false, true);

        // remove tmp directory
        fs.rmdirSync(path.resolve(__dirname, '../tmp/'));

        done();
    });
});