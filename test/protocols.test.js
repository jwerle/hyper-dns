const { test } = require('tape')
const protocols = require('../protocols.js')
const { matchRegex } = require('../resolve-context.js')

;(() => {
  const { dat } = protocols
  const key = '100c77d788fdaf07b89b28e9d276e47f2e44011f4adb981921056e1b3b40e99e'
  test('dat: local urls', async t => {
    t.deepEquals(
      await dat({ matchRegex }, key),
      { key, ttl: null }
    )
  })
  test('dat: looking for dns records', async t => {
    const name = 'datproject.org'
    t.deepEquals(
      await dat({
        matchRegex,
        async getDNSTxtRecord (domain, regex) {
          t.equals(domain, name)
          t.match(`datkey=${key}`, regex)
          return { key, ttl: 10 }
        }
      }, name),
      { key, ttl: 10 }
    )
  })
  test('dat: looking for well-known record', async t => {
    const name = 'datproject.org'
    t.deepEquals(
      await dat({
        matchRegex,
        async getDNSTxtRecord () {
          return undefined
        },
        async fetchWellKnown (domain, schema, regex, redirects) {
          t.equals(redirects, 6)
          t.equals(domain, name)
          t.equals(schema, 'dat')
          t.match(key, regex)
          t.match(`dat:${key}`, regex)
          t.match(`dat://${key}`, regex)
          return { key, ttl: 10 }
        }
      }, name),
      { key, ttl: 10 }
    )
  })
})()

;(() => {
  const { cabal } = protocols
  const key = '100c77d788fdaf07b89b28e9d276e47f2e44011f4adb981921056e1b3b40e99e'
  test('cabal: local urls', async t => {
    t.deepEquals(
      await cabal({ matchRegex }, key),
      { key, ttl: null }
    )
  })
  test('cabal: looking for dns records', async t => {
    const name = 'cblgh.org'
    t.deepEquals(
      await cabal({
        matchRegex,
        async getDNSTxtRecord (domain, regex) {
          t.equals(domain, name)
          t.match(`cabalkey=${key}`, regex)
          return { key, ttl: 10 }
        }
      }, name),
      { key, ttl: 10 }
    )
  })
  test('cabal: looking for well-known record', async t => {
    const name = 'cblgh.org'
    t.deepEquals(
      await cabal({
        matchRegex,
        async getDNSTxtRecord () {
          return undefined
        },
        async fetchWellKnown (domain, schema, regex, redirects) {
          t.equals(redirects, 6)
          t.equals(domain, name)
          t.equals(schema, 'cabal')
          t.match(key, regex)
          t.match(`cabal:${key}`, regex)
          t.match(`cabal://${key}`, regex)
          return { key, ttl: 10 }
        }
      }, name),
      { key, ttl: 10 }
    )
  })
})()

;(() => {
  const { ara } = protocols
  const key = '22dea0fbb722b20ab11469ed61b2409cb0ca774a285914f160071e4e9e3b8ca8'
  test('ara: local urls', async t => {
    t.deepEquals(
      await ara({ matchRegex }, key),
      { key, ttl: null }
    )
  })
  test('ara: looking for dns records', async t => {
    const name = 'jwerle.pub'
    t.deepEquals(
      await ara({
        matchRegex,
        async getDNSTxtRecord (domain, regex) {
          t.equals(domain, name)
          t.match(`did:ara:${key}`, regex)
          return { key, ttl: 10 }
        }
      }, name),
      { key, ttl: 10 }
    )
  })
  test('ara: looking for well-known record', async t => {
    const name = 'jwerle.pub'
    t.deepEquals(
      await ara({
        matchRegex,
        async getDNSTxtRecord () {
          return undefined
        },
        async fetchWellKnown (domain, schema, regex, redirects) {
          t.equals(redirects, 6)
          t.equals(domain, name)
          t.equals(schema, 'ara')
          t.match(key, regex)
          t.match(`did:ara:${key}`, regex)
          return { key, ttl: 10 }
        }
      }, name),
      { key, ttl: 10 }
    )
  })
})()
