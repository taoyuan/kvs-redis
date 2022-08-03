import {Store} from 'kvs';
import {kvsTestAll} from 'kvs-testlab';
import Redis from '../redis';
import {TestRedisUrl} from './support';

describe('kvs-redis/commons', function () {
  kvsTestAll(() =>
    Store.create(Redis, {
      redis: require('redis'),
      url: TestRedisUrl,
    }),
  );
});
