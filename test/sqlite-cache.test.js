process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { test } = require('tape')
const debug = require('debug')('sqlite-test')
const { SQLiteCache } = require('../sqlite-cache')
const { HyperCachedLookup } = require('../lookup-cached.js')
const { mkdtempSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')
const { createHttpsServer, TEST_KEY } = require('./helpers.js')
const Database = require('better-sqlite3')

const server = createHttpsServer(HyperCachedLookup)
const workdir = mkdtempSync(join(tmpdir(), 'sqlite-test'))

test('simple operations', async t => {
  const cache = new SQLiteCache({
    file: join(workdir, 'simple.db')
  })
  await cache.write({ name: 'old', keys: { hyper: 'world' }, expires: 10000 })
  const newDate = Date.now() + 10000
  await cache.write({ name: 'new', keys: { hyper: 'new-world' }, expires: newDate })
  t.deepEquals(await cache.read('old'), { keys: { hyper: 'world' }, expires: 10000 })
  await cache.flush({})
  t.same(await cache.read('old'), null, 'after flush the old one should be gone')
  t.deepEquals(await cache.read('new'), { keys: { hyper: 'new-world' }, expires: newDate }, 'after flush the new one should still be there')
  cache.db.close()
  t.same(await cache.read('old'), null)
  t.deepEquals(await cache.read('new'), { keys: { hyper: 'new-world' }, expires: newDate }, 'after closing it should re-open again')
  cache.db.close()
})

test('combination with hyperlookup', async t => {
  const file = join(workdir, 'combo.db')
  const persistentCache = new SQLiteCache({
    file,
    debug
  })
  const name = 'test.com'
  const key = TEST_KEY
  const service = await server.init({
    dns: {
      persistentCache,
      debug,
      minTTL: 1
    },
    json: () => {
      return {
        Answer: [
          { data: `datkey=${key}`, TTL: 5 }
        ]
      }
    }
  })
  const lookedUp = await service.lookup(name)
  const { expires } = lookedUp
  t.equals(typeof expires, 'number')
  t.ok(expires > Date.now(), `${expires} > ${Date.now()}`)
  t.ok(expires < Date.now() + 6000, `${expires} < ${Date.now() + 6000}`)
  t.deepEquals(lookedUp, {
    name,
    keys: {
      hyper: key
    },
    expires
  })
  await service.close()
  const db = new Database(file)
  t.deepEquals(db.prepare('SELECT * from names').all(), [
    { name, protocol: 'hyper', key, expires }
  ])
  db.close()
}).teardown(server.reset)

test('clearing entries', async t => {
  const cache = new SQLiteCache({
    file: join(workdir, 'clearing.db'),
    debug
  })
  const expires = Date.now() + 10000
  await cache.write({ name: 'a', keys: { hyper: 'x12' }, expires })
  await cache.write({ name: 'b', keys: { hyper: 'x34' }, expires })
  await cache.write({ name: 'c', keys: { hyper: 'x56' }, expires })
  const readAll = names => Promise.all(names.map(name => cache.read(name)))
  t.deepEquals(await readAll(['a', 'b', 'c']), [
    { keys: { hyper: 'x12' }, expires },
    { keys: { hyper: 'x34' }, expires },
    { keys: { hyper: 'x56' }, expires }
  ])
  cache.clearName('b')
  t.deepEquals(await readAll(['a', 'b', 'c']), [
    { keys: { hyper: 'x12' }, expires },
    null,
    { keys: { hyper: 'x56' }, expires }
  ])
  cache.clear()
  t.deepEquals(await readAll(['a', 'b', 'c']), [
    null,
    null,
    null
  ])
})

test('wal clearing', async t => {
  const cache = new SQLiteCache({
    file: join(workdir, 'wal-clearing.db'),
    debug,
    walCheckInterval: 10,
    maxWalSize: 2
  })
  await cache.write({ name: 'hi', keys: { hyper: null }, expires: Date.now() })
  await new Promise((resolve) => setTimeout(resolve, 100))
  await cache.close()
})
