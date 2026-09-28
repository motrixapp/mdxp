import { describe, expect, it } from 'vitest'
import { InitializeParamsSchema, InitializeResultSchema } from '../index.js'

const initialize = {
  protocolVersion: '1.0',
  client: {
    kind: 'extension',
    name: 'Motrix Extension',
    version: '0.1.14',
    extensionId: 'app.motrix.safari.extension',
    browser: 'safari',
    browserVersion: '27.0',
    locale: 'en-US',
  },
  capabilities: { submitDownload: true },
  adapters: [],
}

describe('Safari initialization trust and compatibility boundaries', () => {
  it.each(['chromium', 'firefox', 'safari'])(
    'accepts %s with both explicit and legacy extension kinds',
    (browser) => {
      const { kind: _kind, ...legacy } = initialize.client
      for (const client of [
        { ...legacy, browser },
        { ...legacy, browser, kind: 'extension' },
      ]) {
        expect(InitializeParamsSchema.parse({ ...initialize, client })).toEqual(
          {
            ...initialize,
            client: { ...client, kind: 'extension' },
          }
        )
      }
    }
  )

  it.each([
    undefined,
    null,
    true,
    1,
    [],
    {},
    '',
    'Safari',
    'SAFARI',
    'safari ',
    ' safari',
    'safari\0',
    'safarі',
    'chrome',
    'unknown',
  ])('rejects malformed or unrecognized browser %j', (browser) => {
    expect(
      InitializeParamsSchema.safeParse({
        ...initialize,
        client: { ...initialize.client, browser },
      }).success
    ).toBe(false)
  })

  it.each([null, [], 'extension', 42])(
    'rejects invalid client %j',
    (client) => {
      expect(
        InitializeParamsSchema.safeParse({ ...initialize, client }).success
      ).toBe(false)
    }
  )

  it.each([null, '', 'admin', 'server'])('rejects invalid kind %j', (kind) => {
    expect(
      InitializeParamsSchema.safeParse({
        ...initialize,
        client: { ...initialize.client, kind },
      }).success
    ).toBe(false)
  })

  it.each(['0.8.0', '2.0', null])(
    'does not change the wire version to %j',
    (protocolVersion) => {
      expect(
        InitializeParamsSchema.safeParse({ ...initialize, protocolVersion })
          .success
      ).toBe(false)
    }
  )

  it('does not turn caller-supplied trust claims into protocol authorization', () => {
    const claims = JSON.parse(
      '{"verified":true,"pairToken":"forged","origin":"safari-web-extension://forged","__proto__":{"trusted":true}}'
    )
    const result = InitializeParamsSchema.parse({
      ...initialize,
      ...claims,
      client: { ...initialize.client, ...claims },
      capabilities: {
        ...initialize.capabilities,
        taskReveal: true,
        downloadDirectories: true,
      },
    })
    expect(result).toEqual(initialize)
    expect(Object.getPrototypeOf(result.client)).toBe(Object.prototype)
    expect(Object.prototype).not.toHaveProperty('trusted')
  })

  it('preserves CLI identities and does not infer an extension from extra fields', () => {
    const client = { kind: 'cli', name: 'motrix-cli', version: '1.0' }
    expect(
      InitializeParamsSchema.parse({
        ...initialize,
        client: { ...client, browser: 'safari', extensionId: 'forged' },
      }).client
    ).toEqual(client)
  })

  it('does not enable new host capabilities for legacy responses', () => {
    const result = InitializeResultSchema.parse({
      protocolVersion: '1.0',
      server: { name: 'motrix', version: '2', runtime: 'electron' },
      capabilities: {
        ffmpegAvailable: false,
        selectionKinds: ['direct'],
        progress: true,
        cancellation: true,
      },
      serverAdapters: [],
    })
    expect(result.capabilities.taskReveal).toBe(false)
    expect(result.capabilities.downloadDirectories).toBeUndefined()
  })
})
