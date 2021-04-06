// For local https server
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { test } = require('tape')
const { RecordNotFoundError, HyperCachedLookup } = require('../lookup-cached.js')
const { ArgumentError } = require('../lookup.js')
const { createHttpsServer, rejects, TEST_KEYS, TEST_KEY } = require('./helpers.js')

const server = createHttpsServer(HyperCachedLookup)

test('gracefully clearing an empty cache', async t => {
  const dns = new HyperCachedLookup()
  await dns.clear()
  await dns.clearName('hello')
  await dns.flush()
  await dns.close()
})

test('using the ttl set to the dns record', async t => {
  const domain = 'foo.com'
  let count = 0
  const dns = await server.init({
    dns: {
      minTTL: 0
    },
    json: () => {
      count++
      return {
        Answer: [
          { data: `datkey=${TEST_KEY}`, TTL: 0.3 }
        ]
      }
    }
  })
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 1)
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 1)
  await new Promise(resolve => setTimeout(resolve, 500))
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 2)
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 2)
}).teardown(server.reset)

test('the maxTTL will override the ttl of the server', async t => {
  const domain = 'foo.com'
  let count = 0
  const dns = await server.init({
    dns: {
      minTTL: 0,
      maxTTL: 0.3
    },
    json: () => {
      count++
      return {
        Answer: [
          { data: `datkey=${TEST_KEY}`, TTL: 100 }
        ]
      }
    }
  })
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 1)
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 1)
  await new Promise(resolve => setTimeout(resolve, 500))
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 2)
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 2)
}).teardown(server.reset)

test('removing an entry from the cache', async t => {
  let ops = []
  const a = 'foo.bar'
  const b = 'me.you'
  const dns = await server.init({
    dns: {
      minTTL: 0,
      persistentCache: {
        async read (name) {
          ops.push(`read ${name}`)
        },
        async clearName (name) {
          ops.push(`clearName ${name}`)
        },
        async write ({ name }) {
          ops.push(`write ${name}`)
        },
        async close () {
          ops.push('close')
        }
      }
    },
    json: (req) => {
      const { domain } = /^\/query\?name=(?<domain>.*)\.&type=TXT$/.exec(req.url).groups
      ops.push(`json ${domain}`)
      return {
        Answer: [
          { data: `datkey=${TEST_KEY}`, TTL: 100 }
        ]
      }
    }
  })
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(b), TEST_KEY)
  t.deepEquals(ops, [
    `read ${a}`,
    `json ${a}`,
    `write ${a}`,
    `read ${b}`,
    `json ${b}`,
    `write ${b}`
  ])
  ops = []
  await dns.clearName(a)
  t.deepEquals(ops, [
    `clearName ${a}`
  ])
  ops = []
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(b), TEST_KEY)
  await dns.close()
  await dns.close() // Duplicate closes shouldn't make a problem
  t.deepEquals(ops, [
    `read ${a}`,
    `json ${a}`,
    `write ${a}`,
    'close'
  ])
}).teardown(server.reset)

test('clearing the whole cache', async t => {
  let ops = []
  const a = 'foo.bar'
  const b = 'me.you'
  const dns = await server.init({
    dns: {
      minTTL: 0,
      persistentCache: {
        async read (name) {
          ops.push(`read ${name}`)
        },
        async clear () {
          ops.push('clear')
        },
        async write ({ name }) {
          ops.push(`write ${name}`)
        }
      }
    },
    json: (req) => {
      const { domain } = /^\/query\?name=(?<domain>.*)\.&type=TXT$/.exec(req.url).groups
      ops.push(`json ${domain}`)
      return {
        Answer: [
          { data: `datkey=${TEST_KEY}`, TTL: 100 }
        ]
      }
    }
  })
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(b), TEST_KEY)
  t.deepEquals(ops, [
    `read ${a}`,
    `json ${a}`,
    `write ${a}`,
    `read ${b}`,
    `json ${b}`,
    `write ${b}`
  ])
  ops = []
  await dns.clear()
  t.deepEquals(ops, [
    'clear'
  ])
  ops = []
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(b), TEST_KEY)
  t.deepEquals(ops, [
    `read ${a}`,
    `json ${a}`,
    `write ${a}`,
    `read ${b}`,
    `json ${b}`,
    `write ${b}`
  ])
}).teardown(server.reset)

test('flushing old entries', async t => {
  let ops = []
  const a = 'foo.bar'
  const b = 'me.you'
  const dns = await server.init({
    dns: {
      minTTL: 0,
      persistentCache: {
        async read (name) {
          ops.push(`read ${name}`)
        },
        async flush () {
          ops.push('flush')
        },
        async write ({ name }) {
          ops.push(`write ${name}`)
        }
      }
    },
    json: (req) => {
      const { domain } = /^\/query\?name=(?<domain>.*)\.&type=TXT$/.exec(req.url).groups
      ops.push(`json ${domain}`)
      return {
        Answer: [
          { data: `datkey=${TEST_KEY}`, TTL: domain === 'me.you' ? 0.01 : 1000 }
        ]
      }
    }
  })
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(b), TEST_KEY)
  t.deepEquals(ops, [
    `read ${a}`,
    `json ${a}`,
    `write ${a}`,
    `read ${b}`,
    `json ${b}`,
    `write ${b}`
  ])
  ops = []
  await new Promise(resolve => setTimeout(resolve, 200))
  await dns.flush()
  t.deepEquals(ops, [
    'flush'
  ])
  ops = []
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(a), TEST_KEY)
  t.equals(await dns.resolveName(b), TEST_KEY)
  t.deepEquals(ops, [
    `read ${b}`,
    `json ${b}`,
    `write ${b}`
  ])
}).teardown(server.reset)

// TODO: hosts?
// TODO: Add File System storage
// TODO: Add CLI
// TODO: Test the propagation of the abort signal
// TODO: Test maxSize of cache
// TODO: Use byte api instead of
// TODO: Test typescript definitions
// TODO: Support IPNS lookup
// TODO: Add ara support: https://github.com/AraBlocks/ara-identity-dns/blob/master/index.js#L121
// TODO: Add Documentation

test('parallel requests reuse promises', async t => {
  const dns = await server.init({
    key: TEST_KEY
  })
  const domain = 'test.com'
  const p = dns.resolveName(domain)
  const p2 = dns.resolveName(domain)
  t.same(p, p2)
  t.deepEquals(dns.processes, { [domain]: p })
  t.deepEquals(await Promise.all([p, p2]), [TEST_KEY, TEST_KEY])
  t.deepEquals(dns.processes, {})
}).teardown(server.reset)

test('restoring data from persistent storage', async t => {
  let count = 0
  const dns = await server.init({
    dns: {
      persistentCache: {
        async read (name) {
          count++
          return {
            name,
            keys: {
              hyper: TEST_KEY
            },
            expires: Date.now() + 1000
          }
        }
      }
    }
  })
  const domain = 'test.com'
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(await dns.resolveName(domain), TEST_KEY)
  t.equals(count, 1, 'after initial resolve, the local cache is used')
}).teardown(server.reset)

test('restoring miss from persistent storage', async t => {
  const dns = await server.init({
    dns: {
      persistentCache: {
        read: async (name) => ({
          name,
          keys: {
            hyper: null
          },
          expires: Date.now() + 1000
        })
      }
    }
  })
  await rejects(t, dns.resolveName('test.com', { noWellknownDat: true }), RecordNotFoundError)
}).teardown(server.reset)

test('restoring old entry from persistent storage', async t => {
  const domain = 'test.com'
  const dns = await server.init({
    key: [TEST_KEY],
    dns: {
      persistentCache: {
        read: async (name) => ({
          name,
          keys: {
            hyper: TEST_KEYS[1]
          },
          expires: Date.now() - 1
        }),
        write: async () => {}
      }
    }
  })
  t.equals(await dns.resolveName(domain, { noWellknownDat: true }), TEST_KEY)
}).teardown(server.reset)

test('error restoring entry from persistent storage', async t => {
  const domain = 'test.com'
  const dns = await server.init({
    key: TEST_KEY,
    dns: {
      persistentCache: {
        read: async () => {
          throw new Error('silly error')
        },
        write: async () => {}
      }
    }
  })
  t.equals(await dns.resolveName(domain, { noWellknownDat: true }), TEST_KEY)
}).teardown(server.reset)

test('ignoring restoring miss from persistent storage', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: {
      persistentCache: {
        read: async (name) => ({
          name,
          keys: {
            hyper: null
          },
          expires: Date.now() + 1000
        })
      }
    }
  })
  t.equals(await dns.resolveName('test.com', { noWellknownDat: true, ignoreCachedMiss: true }), TEST_KEY)
}).teardown(server.reset)

test('well-known lookup with ttl', async t => {
  let count = 0
  const service = await server.init({
    dns: {
      minTTL: 0,
      corsWarning: null
    },
    handler (req, res) {
      count++
      t.equals(req.url, '/.well-known/dat')
      res.end(`${TEST_KEY}
ttl=1`)
    }
  })
  t.equals(await service.resolveName('localhost'), TEST_KEY)
  t.equals(await service.resolveName('localhost'), TEST_KEY)
  await new Promise(resolve => setTimeout(resolve, 1100))
  t.equals(await service.resolveName('localhost'), TEST_KEY)
  t.equals(count, 2)
}).teardown(server.reset)

test('well-known lookup with invalid ttl', async t => {
  let count = 0
  const service = await server.init({
    dns: {
      minTTL: 0,
      corsWarning: false,
      ttl: 1
    },
    handler (req, res) {
      count++
      t.equals(req.url, '/.well-known/dat')
      res.end(`${TEST_KEY}
ttl=a`)
    }
  })
  t.equals(await service.resolveName('localhost'), TEST_KEY)
  t.equals(await service.resolveName('localhost'), TEST_KEY)
  await new Promise(resolve => setTimeout(resolve, 1100))
  t.equals(await service.resolveName('localhost'), TEST_KEY)
  t.equals(count, 2)
}).teardown(server.reset)

test('cache entry ignored when result of wrong type', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: { persistentCache: { read: async () => '' } }
  })
  t.equals(await dns.resolveName('test.com', { noWellknownDat: true }), TEST_KEY)
}).teardown(server.reset)

test('cache entry ignored when result.expires of wrong type', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: { persistentCache: { read: async () => ({ expires: '12', keys: { hyper: TEST_KEY } }) } }
  })
  t.equals(await dns.resolveName('test.com', { noWellknownDat: true }), TEST_KEY)
}).teardown(server.reset)

test('cache entry ignored when result.expires is NaN', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: { persistentCache: { read: async () => ({ expires: parseInt('a'), keys: { hyper: TEST_KEY } }) } }
  })
  t.equals(await dns.resolveName('test.com', { noWellknownDat: true }), TEST_KEY)
}).teardown(server.reset)

test('cache entry ignored when result.expires is too far into future', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: {
      maxTTL: 1,
      persistentCache: { read: async () => ({ expires: Date.now() + 1200, keys: {} }) }
    }
  })
  t.equals(await dns.resolveName('test.com', { noWellknownDat: true }), TEST_KEY)
}).teardown(server.reset)

test('cache entry ignored when result.keys is invalid', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: {
      maxTTL: 1,
      persistentCache: { read: async () => ({ expires: Date.now(), keys: null }) }
    }
  })
  t.equals(await dns.resolveName('test.com', { noWellknownDat: true }), TEST_KEY)
}).teardown(server.reset)

test('cache entry ignored when result.keys.hyper is invalid', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: {
      maxTTL: 1,
      persistentCache: { read: async () => ({ expires: Date.now(), keys: { hyper: 'abcd' } }) }
    }
  })
  t.equals(await dns.resolveName('test.com', { noWellknownDat: true }), TEST_KEY)
}).teardown(server.reset)

test('error of keyRegex', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: {
      maxTTL: 1,
      keyRegex: /xxx:.{4}/,
      persistentCache: { read: async () => ({ expires: Date.now(), keys: { hyper: 'xxx:abcd' } }) }
    }
  })
  await rejects(t, dns.resolveName('test.com'), ArgumentError)
}).teardown(server.reset)

test('ignoring cached entry', async t => {
  const dns = await server.init({
    key: TEST_KEY,
    dns: {
      persistentCache: {
        read: async (name) => ({
          name,
          keys: {
            hyper: TEST_KEYS[1]
          },
          expires: Date.now() + 1000
        })
      }
    }
  })
  t.equals(await dns.resolveName('test.com', { noWellknownDat: true, ignoreCache: true }), TEST_KEY)
}).teardown(server.reset)
