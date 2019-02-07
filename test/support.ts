import PromiseA = require('bluebird');
import { assert } from "chai";
import { Store } from "kvs";

require('chai').use(require('chai-as-promised'));

export const random = {
  string(len?: number) {
    len = len || 8;
    const chars = "abcdefghiklmnopqrstuvwxyz";
    let str = "";
    for (let i = 0; i < len; i++) {
      const n = Math.floor(Math.random() * chars.length);
      str += chars.substring(n, n + 1);
    }
    return str;
  }
};

export function assertBetween(actual, lower, upper) {
  assert.ok(actual >= lower, "Expected " + actual + " to be >= " + lower);
  assert.ok(actual <= upper, "Expected " + actual + " to be <= " + upper);
}

export function assertWithin(actual, expected, delta) {
  const lower = expected - delta;
  const upper = expected + delta;
  this.assertBetween(actual, lower, upper);
}

export function store(adapter) {
  return async () => await Store.createAndWait(adapter);
}

export async function wait(ms) {
  await PromiseA.fromCallback(cb => setTimeout(cb, ms));
}
