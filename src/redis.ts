import PromiseA = require('bluebird');
import _ = require('lodash');
import {createClient, RedisClient} from "redis";
import {AbstractAdapter, Adapter, AdapterFactory} from "kvs";

const DEFAULT_PORT = 6379;
const DEFAULT_HOST = 'localhost';

interface Packer {
  pack(target: any): string;

  unpack(target: string): any;
}

const DEFAULT_PACKER: Packer = {
  pack: function (target) {
    return JSON.stringify(target);
  },
  unpack: function (target) {
    return JSON.parse(target);
  }
};

export interface RedisSettings {
  client?: RedisClient;
  port?: number;
  host?: string;
  database?: number;
  db?: number;
  packer?: Packer;
}

// settings ref: https://www.npmjs.com/package/redis
export async function initialize(settings: RedisClient | RedisSettings): Promise<AdapterFactory<any>> {
  settings = settings || {};

  let packer = DEFAULT_PACKER;
  let client: RedisClient;
  if (settings instanceof RedisClient) {
    client = settings;
  } else {
    if (settings.client instanceof RedisClient) {
      client = settings.client;
    } else {
      settings.port = settings.port || DEFAULT_PORT;
      settings.host = settings.host || DEFAULT_HOST;
      const db = settings.database || settings.db;

      client = createClient(settings.port, settings.host, settings);
      client.on('error', error => console.log(error));

      if (client.connected) {
        if (db) client.select(db);
      } else {
        const p = new PromiseA(resolve => {
          client.on('connect', function() {
            if (!p.isResolved() && !db) {
              resolve();
            } else if (db) {
              if (p.isResolved()) {
                client.select(db);
              } else {
                client.select(db, () => resolve());
              }
            }
          });
        });


      }

      if (settings.packer) packer = settings.packer;
    }
  }

  return new RedisFactory(client, packer);
}

class RedisFactory implements AdapterFactory<any> {
  readonly name = 'redis';

  constructor(public client: RedisClient,
              protected packer: Packer) {
  }

  async close(): Promise<void> {
    return this.client.end(true);
  }

  create(options?: { [name: string]: any }): Adapter<any> {
    return new Redis(this.client, this.packer, options);
  }

}

class Redis extends AbstractAdapter<any> {

  protected client: RedisClient;
  protected packer: Packer;
  protected ttl: number;
  protected type: string;
  protected isHash: boolean;

  constructor(client, packer, options) {
    super('redis');
    options = options || {};
    this.client = client;
    this.packer = packer;
    this.ttl = options.ttl;
    this.type = options.type;

    this.isHash = _.includes(['hash', 'map', 'object'], this.type);
  }

  async get(key: string): Promise<any> {
    if (this.isHash) {
      return PromiseA.fromCallback(cb => this.client.hgetall(key, cb));
    }
    const result: string = await PromiseA.fromCallback(cb => this.client.get(key, cb));
    return this.packer.unpack(result)
  };

  async set(key: string, value: any): Promise<any> {
    if (this.isHash) {
      return PromiseA.fromCallback(cb => this.client.hmset(key, value, cb));
    }

    if (this.ttl) {
      return PromiseA.fromCallback(cb => this.client.setex(key, this.ttl, this.packer.pack(value), cb));
    } else {
      return PromiseA.fromCallback(cb => this.client.set(key, this.packer.pack(value), cb));
    }
  };

  async getset(key: string, value: any): Promise<any> {
    if (this.isHash) {
      const old = await this.get(key);
      await this.set(key, value);
      return old;
    }

    const result: string = await PromiseA.fromCallback(cb => this.client.getset(key, this.packer.pack(value), cb));
    return this.packer.unpack(result);
  };

  async getdel(key: string): Promise<any> {
    const old = await this.get(key);
    await this.del(key);
    return old;
  };

  async has(key: string): Promise<number> {
    return PromiseA.fromCallback(cb => this.client.exists(key, cb));
  };

  async del(key: string): Promise<number> {
    return PromiseA.fromCallback(cb => this.client.del(key, cb));
  };

  /**
   * Get all bucket keys matching the pattern.
   *
   * @param {string|Function} pattern (optional - default is *)
   * @api public
   */

  async keys(pattern?: string): Promise<string[]> {
    const patternToUse: string = pattern || '*';
    return PromiseA.fromCallback(cb => this.client.keys(patternToUse, cb))
  };

  /**
   * Flush all bucket keys matching the pattern.
   *
   * @param {string|Function} pattern (optional - default is *)
   * @param {Function} callback (optional)
   * @api public
   */

  async clear(pattern?: string): Promise<number> {
    const patternToUse: string = pattern || '*';
    const keys = await this.keys(patternToUse);
    if (_.isEmpty(keys)) {
      return 0;
    }

    let count = 0;
    for (const key of keys) {
      count += await this.del(key);
    }
    return count;
  };

  async close(): Promise<void> {
    if (this.client.connected) {
      await PromiseA.fromCallback(cb => this.client.quit(cb));
    }
  };

}


