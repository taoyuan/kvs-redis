import {ClientOpts} from 'redis';
import includes from '@tib/utils/array/includes';
import isEmpty from '@tib/utils/is/empty';
import {Adapter} from 'kvs';
import {asyncFromCallback} from './utils';

const DEFAULT_PORT = 6379;
const DEFAULT_HOST = 'localhost';

export interface Packer {
  pack(target: any): string;

  unpack(target: any): any;
}

export const JSON_PACKER: Packer = {
  pack: function (target) {
    return JSON.stringify(target);
  },
  unpack: function (target) {
    return typeof target === 'string' ? JSON.parse(target) : target;
  },
};

export interface RedisStatic {
  createClient(port: number, host?: string, options?: ClientOpts): any;

  createClient(unix_socket: string, options?: ClientOpts): any;

  createClient(redis_url: string, options?: ClientOpts): any;

  createClient(options?: ClientOpts): any;
}

export interface RedisOptions {
  redis?: RedisStatic;
  client?: any;
  packer?: Packer;
  port?: number;
  host?: string;
  database?: number;
  db?: number;
  ttl?: number;
  type?: 'hash' | 'map' | 'object';
}

function isRedisClient(x: any): boolean {
  return (
    typeof x === 'function' &&
    typeof x.multi === 'function' &&
    typeof x.batch === 'function'
  );
}

// options ref: https://www.npmjs.com/package/redis
export function resolveRedisClient(options: any | RedisOptions = {}): any {
  if (isRedisClient(options)) {
    return options;
  } else if (isRedisClient(options.client)) {
    return options.client;
  }

  const redis = options.redis ?? require('redis');

  options.port = options.port ?? DEFAULT_PORT;
  options.host = options.host ?? DEFAULT_HOST;
  const db = options.database ?? options.db;

  const client = redis.createClient(options.port, options.host, options);

  if (client.connected) {
    if (db) client.select(db);
  } else {
    client.on('connect', function () {
      if (db) {
        client.select(db);
      }
    });
  }
  return client;
}

export default class Redis implements Adapter {
  name = 'redis';

  protected client: any;
  protected packer: Packer;
  protected ttl?: number;
  protected type?: string;
  protected isHash: boolean;

  static create(options: RedisOptions = {}) {
    return new Redis(options);
  }

  constructor(options: RedisOptions = {}) {
    this.client = resolveRedisClient(options);
    this.packer = options.packer ?? JSON_PACKER;
    this.ttl = options.ttl;
    this.type = options.type;

    this.isHash = includes(this.type, ['hash', 'map', 'object']);
  }

  async get(key: string): Promise<any> {
    if (this.isHash) {
      return asyncFromCallback(cb => this.client.hgetall(key, cb));
    }
    const result = await asyncFromCallback(cb => this.client.get(key, cb));
    return this.packer.unpack(result);
  }

  async set(key: string, value: any, ttl?: number): Promise<any> {
    ttl = ttl ?? this.ttl;
    let answer: any;
    if (this.isHash) {
      answer = await asyncFromCallback(cb => this.client.hmset(key, value, cb));
    } else {
      answer = await asyncFromCallback(cb =>
        this.client.set(key, this.packer.pack(value), cb),
      );
    }

    if (ttl) {
      await asyncFromCallback(cb => this.client.expire(key, ttl, cb));
    }

    return answer;
  }

  async getset(key: string, value: any): Promise<any> {
    if (this.isHash) {
      const old = await this.get(key);
      await this.set(key, value);
      return old;
    }

    const result: string = await asyncFromCallback(cb =>
      this.client.getset(key, this.packer.pack(value), cb),
    );
    return this.packer.unpack(result);
  }

  async getdel(key: string): Promise<any> {
    const old = await this.get(key);
    await this.del(key);
    return old;
  }

  async has(key: string): Promise<number> {
    return asyncFromCallback(cb => this.client.exists(key, cb));
  }

  async del(key: string): Promise<number> {
    return asyncFromCallback(cb => this.client.del(key, cb));
  }

  /**
   * Get all bucket keys matching the pattern.
   *
   * @param {string|Function} pattern (optional - default is *)
   * @api public
   */
  async keys(pattern?: string): Promise<string[]> {
    const patternToUse: string = pattern ?? '*';
    return asyncFromCallback(cb => this.client.keys(patternToUse, cb));
  }

  /**
   * Flush all bucket keys matching the pattern.
   *
   * @param {string|Function} pattern (optional - default is *)
   * @param {Function} callback (optional)
   * @api public
   */
  async clear(pattern?: string): Promise<number> {
    const patternToUse: string = pattern ?? '*';
    const keys = await this.keys(patternToUse);
    if (isEmpty(keys)) {
      return 0;
    }

    let count = 0;
    for (const key of keys) {
      count += await this.del(key);
    }
    return count;
  }

  async close(): Promise<void> {
    if (this.client.connected) {
      await asyncFromCallback(cb => this.client.quit(cb));
    }
  }
}
