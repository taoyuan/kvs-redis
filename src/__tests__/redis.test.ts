import {Bucket, Store} from 'kvs';
import redis from 'redis-mock';
import {fromCallback} from 'tily/promise/fromCallback';
import Redis from '../redis';
import * as s from './support';

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

    let stubCreateClient: jest.SpyInstance;

    beforeAll(function () {
      redisClient = redis.createClient();
      stubCreateClient = jest.spyOn(redis, 'createClient').mockReturnValue(redisClient);
    });

    afterAll(async () => {
      stubCreateClient.mockRestore();
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
      expect(widget).toEqual({name});
    });

    it('should caches the result of the function in redis', async () => {
      const widget = await bucket.get(key, name);
      expect(widget).toBeTruthy();

      const result: string = await fromCallback(cb => redisClient.get(bucket.fullkey(key), cb));
      expect(JSON.parse(result)).toEqual({name});
    });

    describe('when load function calls back with an error', function () {
      it("should calls back with that error and doesn't bucket result", async () => {
        const fakeError = new Error(s.random.string());
        const stubGetWidget = jest.spyOn(methods, 'getWidget').mockImplementation(() => {
          throw fakeError;
        });

        await expect(bucket.get(key, name)).rejects.toThrow(fakeError.message);
        const result: string = await fromCallback(cb => redisClient.get(bucket.fullkey(key), cb));
        expect(result).toBeFalsy();

        stubGetWidget.mockRestore();
      });
    });

    it('should retrieves data from redis when available', async () => {
      let widget = await bucket.get(key, name);
      expect(widget).toBeTruthy();

      const result: string = await fromCallback(cb => redisClient.get(bucket.fullkey(key), cb));
      expect(result).toBeTruthy();

      const spyGet = jest.spyOn(redisClient, 'get');
      widget = await bucket.get(key);
      expect(widget).toEqual({name});
      expect(spyGet).toBeCalledWith(bucket.fullkey(key), expect.anything());
      spyGet.mockRestore();
    });

    describe('when using ttl', function () {
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
        expect(widget).toBeTruthy();

        const result: number = await fromCallback(cb => redisClient.ttl(bucket.fullkey(key), cb));
        s.assertWithin(result, ttl, 2);
      });
    });
  });
});
