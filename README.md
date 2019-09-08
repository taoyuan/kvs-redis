# kvs-redis

[![Greenkeeper badge](https://badges.greenkeeper.io/taoyuan/kvs-redis.svg)](https://greenkeeper.io/)

> Redis adapter for kvs

## Installation

```bash
> npm i kvs-redis
```

## Usage

```typescript
import {Store} from "kvs";

const store = Store.create('redis', {/*...*/});

(async () => {
  const bucket = await store.createBucket(/*...*/);
  // ...
})();
```
