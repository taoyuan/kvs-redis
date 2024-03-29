import {Adapter} from 'kvs';
import {createClient, RedisClientOptions, RedisClientType} from 'redis';
import {includes} from 'tily/array/includes';
import {isEmpty} from 'tily/is/empty';

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
  createClient: typeof createClient;
}

export interface RedisOptions extends RedisClientOptions {
  redis?: RedisStatic;
  client?: any;
  packer?: Packer;
  url?: string;
  port?: number;
  host?: string;
  database?: number;
  db?: number;
  ttl?: number;
  type?: 'hash' | 'map' | 'object';
}

function isRedisClient(x: any): boolean {
  return typeof x === 'function' && typeof x.multi === 'function' && typeof x.batch === 'function';
}

// options ref: https://www.npmjs.com/package/redis
async function resolveRedisClient(options: any | RedisOptions = {}) {
  if (isRedisClient(options)) {
    return options;
  } else if (isRedisClient(options.client)) {
    return options.client;
  }

  const redis: RedisStatic = options.redis ?? {createClient};

  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  options.url = options.url ?? `redis://${host}:${port}`;
  const db = options.database ?? options.db;

  const client = redis.createClient(options);

  await client.connect();
  if (db) {
    await client.select(db);
  }

  return client;
}

export default class Redis implements Adapter {
  name = 'redis';

  protected client: Promise<RedisClientType>;
  protected packer: Packer;
  protected ttl?: number;
  protected type?: string;
  protected isHash: boolean;

  constructor(options: RedisOptions = {}) {
    this.client = resolveRedisClient(options);
    this.packer = options.packer ?? JSON_PACKER;
    this.ttl = options.ttl;
    this.type = options.type;

    this.isHash = includes(this.type, ['hash', 'map', 'object']);
  }

  async get(key: string): Promise<any> {
    const client = await this.client;
    if (this.isHash) {
      return client.hGetAll(key);
    }
    const result = await client.get(key);
    return this.packer.unpack(result);
  }

  async set(key: string, value: any, ttl?: number): Promise<any> {
    const client = await this.client;
    ttl = ttl ?? this.ttl;
    let answer: any;
    if (this.isHash) {
      answer = await client.hSet(key, value);
    } else {
      answer = await client.set(key, this.packer.pack(value));
    }

    if (ttl) {
      await client.expire(key, ttl);
    }

    return answer;
  }

  async getset(key: string, value: any): Promise<any> {
    const client = await this.client;
    if (this.isHash) {
      const old = await this.get(key);
      await this.set(key, value);
      return old;
    }

    const result = await client.getSet(key, this.packer.pack(value));
    return this.packer.unpack(result);
  }

  async getdel(key: string): Promise<any> {
    const old = await this.get(key);
    await this.del(key);
    return old;
  }

  async has(key: string): Promise<number> {
    const client = await this.client;
    return client.exists(key);
  }

  async del(key: string): Promise<number> {
    const client = await this.client;
    return client.del(key);
  }

  /**
   * Get all bucket keys matching the pattern.
   *
   * @param {string|Function} pattern (optional - default is *)
   * @api public
   */
  async keys(pattern?: string): Promise<string[]> {
    const client = await this.client;
    const patternToUse: string = pattern ?? '*';
    return client.keys(patternToUse);
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
    const client = await this.client;
    if (client.isOpen) {
      await client.quit();
    }
  }
}
