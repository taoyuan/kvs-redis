import redis = require('redis-mock');
import {SinonStub} from 'sinon';
import {sinon} from '@tib/testlab/dist/sinon';
import {expect} from '@tib/testlab';
import * as s from './support';
import {Store, Bucket} from 'kvs';
import {asyncFromCallback} from '../utils';
import Redis from '../redis';

const getStore = () =>
  Store.create(Redis, {
    redis: require('redis-mock'),
  });

const methods = {
  async getWidget(name: string) {
    return {name};
  },
};

describe('redis', function () {
  describe('Redis adapter get with load', function () {
    let store;
    let bucket: Bucket;
    let key: string;
    let ttl: number;
    let name: string;

    let redisClient: any;

    let stubCreateClient: SinonStub;

    before(function () {
      redisClient = redis.createClient();
      stubCreateClient = sinon.stub(redis, 'createClient').returns(redisClient);
    });

    after(async () => {
      stubCreateClient.restore();
      redisClient.end(true);
    });

    beforeEach(async () => {
      store = getStore();
      bucket = store.createBucket({
        // eslint-disable-next-line no-shadow
        load: name => methods.getWidget(name ?? 'unknown'),
      });
      key = s.random.string(20);
      name = s.random.string();
    });

    afterEach(async () => {
      await bucket.clear();
    });

    it('should calls back with the result of load', async () => {
      const widget = await bucket.get(key, name);
      expect(widget).deepEqual({name});
    });

    it('should caches the result of the function in redis', async () => {
      const widget = await bucket.get(key, name);
      expect(widget).ok();

      const result: string = await asyncFromCallback(cb =>
        redisClient.get(bucket.fullkey(key), cb),
      );
      expect(JSON.parse(result)).deepEqual({name});
    });

    context('when load function calls back with an error', function () {
      it("should calls back with that error and doesn't bucket result", async () => {
        const fakeError = new Error(s.random.string());
        const stubGetWidget = sinon.stub(methods, 'getWidget');
        stubGetWidget.callsFake(() => {
          throw fakeError;
        });

        await expect(bucket.get(key, name)).rejectedWith(fakeError.message);
        const result: string = await asyncFromCallback(cb =>
          redisClient.get(bucket.fullkey(key), cb),
        );
        expect(result).not.ok();

        stubGetWidget.restore();
      });
    });

    it('should retrieves data from redis when available', async () => {
      let widget = await bucket.get(key, name);
      expect(widget).ok();

      const result: string = await asyncFromCallback(cb =>
        redisClient.get(bucket.fullkey(key), cb),
      );
      expect(result).ok();

      const spyGet = sinon.spy(redisClient, 'get');
      widget = await bucket.get(key);
      expect(widget).deepEqual({name});
      expect(spyGet.calledWith(bucket.fullkey(key))).ok();
      spyGet.restore();
    });

    context('when using ttl', function () {
      beforeEach(async () => {
        ttl = 50;
        bucket = getStore().createBucket({
          ttl,
          // eslint-disable-next-line no-shadow
          load: name => methods.getWidget(name ?? 'unknown'),
        });
      });

      afterEach(async () => {
        await bucket.clear();
      });

      it('expires cached result after ttl seconds', async () => {
        const widget = await bucket.get(key, name);
        expect(widget).ok();

        const result: number = await asyncFromCallback(cb =>
          redisClient.ttl(bucket.fullkey(key), cb),
        );
        s.assertWithin(result, ttl, 2);
      });
    });
  });
});
