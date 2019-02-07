import PromiseA = require("bluebird");
import { RedisClient } from "redis";

import { assert } from "chai";
import sinon = require('sinon');
import redis = require('redis');

import { Bucket } from "kvs";
import RedisAdapter = require("..");
import s = require("./support");

const getStore = s.store(RedisAdapter);

const methods = {
  async getWidget(name) {
    return { name };
  }
};

describe("Redis adapter get with load", function() {
  let store;
  let bucket: Bucket;
  let key;
  let ttl;
  let name;

  let redisClient: RedisClient;

  before(function() {
    redisClient = redis.createClient();
    sinon.stub(redis, "createClient").returns(redisClient);
  });

  beforeEach(async () => {
    store = await getStore();
    bucket = await store.createBucket({
      load: async (name) => await methods.getWidget(name)
    });
    key = s.random.string(20);
    name = s.random.string();
  });

  after(async () => {
    // @ts-ignore
    redis.createClient.restore();
    await bucket.clear();
    redisClient.end(true);
  });

  it("should calls back with the result of load", async () => {
    let widget = await bucket.get(key, name);
    assert.deepEqual(widget, { name });
  });

  it("should caches the result of the function in redis", async () => {
    let widget = await bucket.get(key, name);
    assert.ok(widget);

    let result: string = await PromiseA.fromCallback(cb => redisClient.get(bucket.fullkey(key), cb));
    assert.deepEqual(JSON.parse(result), { name });
  });

  context("when load function calls back with an error", function() {
    it("should calls back with that error and doesn't bucket result", async () => {
      const fakeError = new Error(s.random.string());
      const stubGetWidget = sinon.stub(methods, "getWidget");
      stubGetWidget.callsFake(() => {
        throw fakeError;
      });

      await assert.isRejected(bucket.get(key, name), fakeError.message);
      let result: string = await PromiseA.fromCallback(cb => redisClient.get(bucket.fullkey(key), cb));
      assert.notOk(result);

      stubGetWidget.restore();

    });
  });

  it("should retrieves data from redis when available", async () => {
    let widget = await bucket.get(key, name);
    assert.ok(widget);

    let result: string = await PromiseA.fromCallback(cb => redisClient.get(bucket.fullkey(key), cb));
    assert.ok(result);

    sinon.spy(redisClient, "get");
    widget = await bucket.get(key);
    assert.deepEqual(widget, { name });
    // @ts-ignore
    assert.ok(redisClient.get.calledWith(bucket.fullkey(key)));
    // @ts-ignore
    redisClient.get.restore();
  });

  context("when using ttl", function() {
    beforeEach(async () => {
      ttl = 50;
      bucket = await (await getStore()).createBucket({
        ttl,
        load: (name) => methods.getWidget(name)
      });
    });

    afterEach(async () => {
      await bucket.clear();
    });

    it("expires cached result after ttl seconds", async () => {
      let widget = await bucket.get(key, name);
      assert.ok(widget);

      let result: number = await PromiseA.fromCallback(cb => redisClient.ttl(bucket.fullkey(key), cb));
      s.assertWithin(result, ttl, 2);
    });
  });
});
