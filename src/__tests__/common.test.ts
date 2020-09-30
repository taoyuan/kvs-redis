import {kvsTestAll} from 'kvs-testlab';
import {Store} from 'kvs';
import Redis from '../redis';

describe('kvs-redis/commons', function () {
  kvsTestAll(() =>
    Store.create(Redis, {
      redis: require('redis-mock'),
    }),
  );
});
