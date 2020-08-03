/** Nginx key/value store Tests */

const assert = require('assert'),
    path = require('path'),
    fs = require('fs'),
    md5 = require('md5'),
    NgxKeyVal = require(path.resolve(__dirname, '../../client.js')),
    microBenchmark = require('micro-benchmark');

let NKV;


describe('Nginx key/val client tests', async function() {

    // setup clie
    before(function(done) {

        // create tmp directory
        fs.mkdirSync(path.resolve(__dirname, '../tmp/'));

        done();
    });

    it('Initiates key/value client', function(done) {

        // load key/val store
        NKV = new NgxKeyVal({
            "server": "http://your-keyvalue-store.local/"
        });

        assert.equal(typeof NKV, 'object');
        done();
    });

    it('Exposes get(), put() and del() methods', function(done) {
        assert.equal(typeof NKV.get, 'function');
        assert.equal(typeof NKV.put, 'function');
        assert.equal(typeof NKV.del, 'function');
        done();
    });

    it('Get non-existing key', function(done) {

        NKV.get('xxx').then(function(result) {

            assert.equal(result, null);
            done();
        });
    });

    it('Set key with 2 second TTL', function(done) {

        NKV.put('xxx', 'test data', 2).then(function() {
            NKV.get('xxx').then(function(result) {

                assert.equal((typeof result === 'object' && result.value === 'test data'), true);
                done();
            });
        });
    });

    it('Get expired key after 2 second TTL', function(done) {

        this.timeout(5000);

        setTimeout(function() {
            NKV.get('xxx').then(function(result) {

                assert.equal(result, null);
                done();

            });

        }, 3000); // 2.2 seconds

    });

    it('Delete key', function(done) {

        this.timeout(5000);

        NKV.put('xxx', 'test data', 10).then(function() {
            NKV.get('xxx').then(function(result) {

                assert.equal((typeof result === 'object' && result.value === 'test data'), true);

                NKV.del('xxx').then(function(result) {

                    NKV.get('xxx').then(function(result) {

                        assert.equal(result, null);
                        done();
                    });
                });
            });
        });
    });

    it('Get key with memory storage (1 second TTL)', function(done) {

        this.timeout(5000);

        NKV.put('xxx', 'test data', 10).then(async function() {

            var result = microBenchmark.suiteAsync({
                maxOperations: 100, // retrieve 100x
                specs: [{
                    name: 'get-default',
                    fn: function(cb) {

                        NKV.get('xxx').then(function(result) {

                            assert.equal((typeof result === 'object' && result.value === 'test data'), true);
                            cb();
                        });
                    }
                }]
            }, function(result) {

                // print benchmark results
                var report = microBenchmark.report(result, {
                    chartWidth: 10
                });

                NKV.del('xxx').then(function(result) {

                    NKV.put('xxx', 'test data', 10, null, 10).then(async function() {

                        var result = microBenchmark.suiteAsync({
                            maxOperations: 100, // retrieve 100x
                            specs: [{
                                name: 'get-from-cache',
                                fn: function(cb) {

                                    NKV.get('xxx', null, true).then(function(result) {

                                        assert.equal((typeof result === 'object' && result.value === 'test data'), true);
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

                            // require at least 5000 per second
                            assert.equal(result[0].ops > 5000, true);

                            done();

                        });

                    });
                });


            });

        });


    });

    after(function(done) {

        NKV.del('xxx');

        // remove tmp directory
        fs.rmdirSync(path.resolve(__dirname, '../tmp/'));

        done();
    });
});