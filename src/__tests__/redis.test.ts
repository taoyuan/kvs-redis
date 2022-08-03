import {Bucket, Store} from 'kvs';
import * as redis from 'redis';
import {RedisClientType} from 'redis';
import Redis from '../redis';
import * as s from './support';
import {TestRedisUrl} from './support';

const getStore = () =>
  Store.create(Redis, {
    redis: require('redis'),
    url: TestRedisUrl,
  });

const methods = {
  async getWidget(name: string) {
    return {name};
  },
};

describe('redis', function () {
  describe('Redis adapter get with load', function () {
    let store: Store;
    let bucket: Bucket;
    let key: string;
    let ttl: number;
    let name: string;

    let redisClient: RedisClientType;

    // let stubCreateClient: jest.SpyInstance;

    beforeAll(async () => {
      redisClient = redis.createClient({
        url: TestRedisUrl,
      });
      await redisClient.connect();

      store = getStore();
      bucket = store.createBucket({
        load: n => methods.getWidget(n ?? 'unknown'),
      });
    });

    afterAll(async () => {
      if (redisClient.isOpen) {
        await redisClient.quit();
      }

      await store.close();
    });

    beforeEach(() => {
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

      const result = (await redisClient.get(bucket.fullkey(key))) as string;
      expect(JSON.parse(result)).toEqual({name});
    });

    describe('when load function calls back with an error', function () {
      it("should calls back with that error and doesn't bucket result", async () => {
        const fakeError = new Error(s.random.string());
        const stubGetWidget = jest.spyOn(methods, 'getWidget').mockImplementation(() => {
          throw fakeError;
        });

        await expect(bucket.get(key, name)).rejects.toThrow(fakeError.message);
        const result = await redisClient.get(bucket.fullkey(key));
        expect(result).toBeFalsy();

        stubGetWidget.mockRestore();
      });
    });

    it('should retrieves data from redis when available', async () => {
      let widget = await bucket.get(key, name);
      expect(widget).toBeTruthy();

      const result = (await redisClient.get(bucket.fullkey(key))) as string;
      expect(result).toBeTruthy();

      widget = await bucket.get(key);
      expect(widget).toEqual({name});
    });

    describe('when using ttl', function () {
      beforeEach(async () => {
        ttl = 50;
        bucket = getStore().createBucket({
          ttl,
          load: n => methods.getWidget(n ?? 'unknown'),
        });
      });

      afterEach(async () => {
        await bucket.clear();
      });

      it('expires cached result after ttl seconds', async () => {
        const widget = await bucket.get(key, name);
        expect(widget).toBeTruthy();

        const result = await redisClient.ttl(bucket.fullkey(key));
        s.assertWithin(result, ttl, 2);
      });
    });
  });
});
