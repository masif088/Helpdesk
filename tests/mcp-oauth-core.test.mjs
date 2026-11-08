// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { isPublicApiRoute, scopeForRequest } from '../lib/api-key-core.ts'
import { allowedScopesFor } from '../lib/mcp-oauth-consent.ts'
import {
  authorizationServerMetadata,
  bearerToken,
  cleanClientName,
  makeClientId,
  pkceMatches,
  readClientId,
  redirectWith,
  splitScope,
  validChallenge,
  validRedirectUri,
  wwwAuthenticate,
} from '../lib/mcp-oauth-core.ts'

const SECRET = 'test-secret'

describe('redirect addresses', () => {
  it('accepts https, loopback http and app schemes', () => {
    assert.equal(validRedirectUri('https://claude.ai/api/mcp/auth_callback'), true)
    assert.equal(validRedirectUri('http://localhost:33418/callback'), true)
    assert.equal(validRedirectUri('http://127.0.0.1:8080/cb'), true)
    assert.equal(validRedirectUri('cursor://anysphere.cursor-retrieval/oauth/callback'), true)
  })
  it('refuses plain http elsewhere, script schemes, fragments and junk', () => {
    for (const bad of ['http://evil.example/cb', 'javascript:alert(1)', 'data://x', 'file:///etc/passwd', 'https://a.example/cb#frag', 'nope', '', null, 5, 'https://a.example/ b']) {
      assert.equal(validRedirectUri(bad), false, String(bad))
    }
  })
})

describe('client ids are signed', () => {
  const client = { redirectUris: ['https://claude.ai/cb'], name: 'Claude' }
  it('round-trips', () => {
    assert.deepEqual(readClientId(SECRET, makeClientId(SECRET, client)), client)
  })
  it('rejects another secret, a changed body and rubbish', () => {
    const id = makeClientId(SECRET, client)
    assert.equal(readClientId('other', id), null)
    const [body, sig] = id.split('.')
    const forged = Buffer.from(JSON.stringify({ u: ['https://evil.example/cb'], n: 'Claude' })).toString('base64url')
    assert.equal(readClientId(SECRET, `${forged}.${sig}`), null)
    assert.equal(readClientId(SECRET, body), null)
    assert.equal(readClientId(SECRET, 'a.b.c'), null)
    assert.equal(readClientId(SECRET, undefined), null)
    assert.equal(readClientId('', id), null)
  })
  it('cleans the name', () => {
    assert.equal(cleanClientName('<b>Claude</b>'), 'bClaudeb')
    assert.equal(cleanClientName(''), 'AI assistant')
    assert.equal(cleanClientName('x'.repeat(200)).length, 60)
  })
})

describe('PKCE', () => {
  const verifier = 'a'.repeat(43)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  it('matches the right verifier only', () => {
    assert.equal(pkceMatches(verifier, challenge), true)
    assert.equal(pkceMatches('b'.repeat(43), challenge), false)
    assert.equal(pkceMatches('short', challenge), false)
    assert.equal(pkceMatches(undefined, challenge), false)
  })
  it('wants a 43 character challenge', () => {
    assert.equal(validChallenge(challenge), true)
    assert.equal(validChallenge('abc'), false)
    assert.equal(validChallenge(challenge + '='), false)
  })
})

describe('small helpers', () => {
  it('adds code and state to the redirect, keeping what is there', () => {
    assert.equal(redirectWith('https://a.example/cb?x=1', { code: 'c', state: 's', error: null }), 'https://a.example/cb?x=1&code=c&state=s')
  })
  it('reads bearer tokens and scopes', () => {
    assert.equal(bearerToken('Bearer abc'), 'abc')
    assert.equal(bearerToken('Basic abc'), null)
    assert.equal(bearerToken(null), null)
    assert.deepEqual(splitScope('a b  a,c'), ['a', 'b', 'c'])
    assert.deepEqual(splitScope(undefined), [])
  })
  it('points at the resource metadata', () => {
    assert.equal(wwwAuthenticate('https://p.example'), 'Bearer resource_metadata="https://p.example/.well-known/oauth-protected-resource"')
  })
  it('advertises PKCE S256 and public clients only', () => {
    const m = authorizationServerMetadata('https://p.example', ['tickets:read'])
    assert.deepEqual(m.code_challenge_methods_supported, ['S256'])
    assert.deepEqual(m.token_endpoint_auth_methods_supported, ['none'])
    assert.equal(m.token_endpoint, 'https://p.example/api/oauth/token')
  })
})

describe('what a person may approve', () => {
  it('clients cannot read the team or change tickets', () => {
    const s = allowedScopesFor('customer')
    assert.equal(s.includes('team:read'), false)
    assert.equal(s.includes('tickets:update'), false)
    assert.equal(s.includes('tickets:read'), true)
  })
  it('staff can change tickets but not read the team; managers can read the team', () => {
    assert.equal(allowedScopesFor('staff').includes('tickets:update'), true)
    assert.equal(allowedScopesFor('staff').includes('team:read'), false)
    assert.equal(allowedScopesFor('manager').includes('team:read'), true)
    assert.equal(allowedScopesFor(undefined).includes('tickets:update'), false)
  })
})

describe('routes that check their own token', () => {
  it('lets /api/mcp and the sign-in calls through the key check, whatever the method', () => {
    for (const m of ['GET', 'POST', 'OPTIONS']) {
      assert.equal(isPublicApiRoute(m, '/api/mcp'), true)
      assert.equal(isPublicApiRoute(m, '/api/oauth/token'), true)
      assert.equal(isPublicApiRoute(m, '/api/oauth/register'), true)
    }
  })
  it('does not widen what a key may call', () => {
    assert.equal(scopeForRequest('POST', '/api/mcp'), null)
    assert.equal(isPublicApiRoute('GET', '/api/api-keys'), false)
    assert.equal(isPublicApiRoute('GET', '/api/oauth/other'), false)
  })
})
