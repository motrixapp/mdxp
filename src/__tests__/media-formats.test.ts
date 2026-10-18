import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CookieSchema,
  InitializeResultSchema,
  MEDIA_FORMATS_LIMITS,
  MediaFormatCookieSchema,
  MediaFormatEntrySchema,
  MediaFormatsParamsSchema,
  MediaFormatsResultSchema,
  Methods,
  Tools,
  toAgentToolCatalog,
} from '../index.js'

// Same shape and units as the extension's capturePageCookies / mapCookies.
const cookie = {
  name: 'session',
  value: 'test-only',
  domain: '.media.example',
  path: '/watch',
  secure: true,
  httpOnly: true,
  sameSite: 'lax' as const,
  expiresAt: 1_900_000_000_123,
}
const url = 'https://www.media.example/watch/video?id=123'
const video = {
  key: '1080p',
  kind: 'video' as const,
  label: '1080p',
  height: 1080,
  fps: 60,
  ext: 'mp4',
  sizeBytes: 123456,
}
const mp3 = { key: 'mp3', kind: 'audio' as const, label: 'MP3' }

describe('media formats request boundary', () => {
  it('preserves browser Cookie metadata and millisecond expiry', () => {
    const parsed = MediaFormatsParamsSchema.parse({ url, cookies: [cookie] })
    expect(parsed.cookies).toEqual([cookie])
    expect(CookieSchema.parse(parsed.cookies?.[0])).toEqual(cookie)
    expect(parsed.cookies?.[0].expiresAt).toBe(1_900_000_000_123)
  })

  it.each([
    'https://media.example/watch',
    'http://127.0.0.1/video',
    'http://nas/video',
    'http://[::1]/video',
  ])('retains existing HTTP URL support: %s', (url) => {
    expect(MediaFormatsParamsSchema.parse({ url })).toEqual({ url })
  })

  it.each([
    'file:///tmp/video',
    'data:text/plain,video',
    'javascript:alert(1)',
    'ftp://nas/video',
    'https://user:secret@media.example/watch',
    'https://media.example/watch/\nx',
    'https://media.example/watch/\tx',
    'not a URL',
    '',
  ])('rejects an invalid media URL: %s', (url) => {
    expect(MediaFormatsParamsSchema.safeParse({ url }).success).toBe(false)
  })

  it('rejects a raw selector and the old name/value-only cookie draft', () => {
    expect(
      MediaFormatsParamsSchema.safeParse({ url, formatSelector: 'bv*+ba' })
        .success
    ).toBe(false)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url,
        cookies: [{ name: 'session', value: 'test-only' }],
      }).success
    ).toBe(false)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url,
        cookies: [{ ...cookie, storeId: 'browser-only' }],
      }).success
    ).toBe(false)
  })

  it.each([
    { name: '' },
    { name: 'bad=name' },
    { name: 'bad name' },
    { value: 'x\r\nHeader: injected' },
    { value: 'a;b=c' },
    { value: 'x\0y' },
    { value: 'x\ty' },
    { domain: '' },
    { domain: '..media.example' },
    { domain: 'https://media.example' },
    { domain: 'media.example:80' },
    { domain: 'media.example/path' },
    { path: 'watch' },
    { path: '/watch\tother' },
    { expiresAt: -1 },
    { expiresAt: Number.POSITIVE_INFINITY },
  ])('rejects malformed cookie fields: %j', (patch) => {
    expect(
      MediaFormatCookieSchema.safeParse({ ...cookie, ...patch }).success
    ).toBe(false)
  })

  it.each([
    { domain: '.other.example' },
    { domain: 'media.example' }, // Host-only does not include www.
    { domain: '.notmedia.example' },
    { path: '/account' },
    { path: '/wat' }, // Prefix alone is not a cookie path match.
  ])('rejects a cookie not applicable to the requested URL: %j', (patch) => {
    expect(
      MediaFormatsParamsSchema.safeParse({
        url,
        cookies: [{ ...cookie, ...patch }],
      }).success
    ).toBe(false)
  })

  it('accepts host-only/IP cookies and enforces Secure and path boundaries', () => {
    expect(
      MediaFormatsParamsSchema.safeParse({
        url,
        cookies: [{ ...cookie, domain: 'www.media.example' }],
      }).success
    ).toBe(true)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'http://www.media.example/watch/video',
        cookies: [cookie],
      }).success
    ).toBe(false)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'https://www.media.example/watcher',
        cookies: [cookie],
      }).success
    ).toBe(false)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'https://www.media.example/watch',
        cookies: [cookie],
      }).success
    ).toBe(true)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'http://127.0.0.1/video',
        cookies: [{ name: 'local', value: '', domain: '127.0.0.1' }],
      }).success
    ).toBe(true)
  })

  it.each([
    ['www.media.example.', 'https://www.media.example./watch'],
    ['WWW.MEDIA.EXAMPLE.', 'https://www.media.example./watch'],
    ['.media.example.', 'https://media.example./watch'],
    ['.media.example.', 'https://www.media.example./watch'],
    ['.media.example.', 'https://cdn.www.media.example./watch/video'],
  ])('preserves a trailing-dot cookie domain %s for %s', (domain, url) => {
    const scoped = { ...cookie, domain }
    const parsed = MediaFormatsParamsSchema.parse({ url, cookies: [scoped] })
    expect(parsed.url).toBe(url)
    expect(parsed.cookies).toEqual([scoped])
    expect(parsed.cookies?.[0].domain.endsWith('.')).toBe(true)
  })

  it.each([
    ['www.media.example', 'https://www.media.example./watch'],
    ['www.media.example.', 'https://www.media.example/watch'],
    ['.media.example', 'https://media.example./watch'],
    ['.media.example.', 'https://media.example/watch'],
    ['.media.example', 'https://www.media.example./watch'],
    ['.media.example.', 'https://www.media.example/watch'],
    ['media.example.', 'https://www.media.example./watch'],
    ['.media.example.', 'https://notmedia.example./watch'],
    ['.media.example.', 'https://media.example.attacker.test./watch'],
    ['.media.example.', 'https://www.media.example../watch'],
  ])('isolates trailing-dot cookie scope %s from %s', (domain, url) => {
    expect(
      MediaFormatCookieSchema.safeParse({ ...cookie, domain }).success
    ).toBe(true)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url,
        cookies: [{ ...cookie, domain }],
      }).success
    ).toBe(false)
  })

  it.each(['media.example..', '.media.example..', 'www.media.example...', '.'])(
    'rejects a malformed trailing-dot cookie domain %s',
    (domain) => {
      expect(
        MediaFormatCookieSchema.safeParse({ ...cookie, domain }).success
      ).toBe(false)
    }
  )

  it.each([
    'http://www.media.example./watch',
    'https://www.media.example./watcher',
    'https://www.media.example./account',
  ])(
    'retains Secure and path boundaries for trailing-dot cookies at %s',
    (url) => {
      expect(
        MediaFormatsParamsSchema.safeParse({
          url,
          cookies: [{ ...cookie, domain: '.media.example.' }],
        }).success
      ).toBe(false)
    }
  )

  it('bounds the whole parsed request rather than each cookie in isolation', () => {
    const oversized = {
      url,
      cookies: Array.from({ length: 256 }, (_, index) => ({
        ...cookie,
        name: `c${index}`,
        value: 'v'.repeat(4096),
      })),
    }
    expect(Buffer.byteLength(JSON.stringify(oversized))).toBeGreaterThan(
      1024 * 1024
    )
    expect(MediaFormatsParamsSchema.safeParse(oversized).success).toBe(false)
    const accepted = MediaFormatsParamsSchema.parse({
      url,
      cookies: Array.from({ length: 256 }, (_, index) => ({
        ...cookie,
        name: `c${index}`,
      })),
    })
    expect(Buffer.byteLength(JSON.stringify(accepted))).toBeLessThanOrEqual(
      MEDIA_FORMATS_LIMITS.paramsBytes
    )
    expect(
      MediaFormatsParamsSchema.safeParse({
        url,
        cookies: Array(257).fill(cookie),
      }).success
    ).toBe(false)
  })

  it('accepts the exact aggregate byte limit and rejects the next byte', () => {
    const request = {
      url,
      cookies: Array.from({ length: 20 }, (_, index) => ({
        ...cookie,
        name: `c${index}`,
        value: '',
      })),
    }
    let remaining =
      MEDIA_FORMATS_LIMITS.paramsBytes -
      Buffer.byteLength(JSON.stringify(MediaFormatsParamsSchema.parse(request)))
    for (const item of request.cookies) {
      const length = Math.min(
        remaining,
        MEDIA_FORMATS_LIMITS.cookieValueCharacters
      )
      item.value = 'x'.repeat(length)
      remaining -= length
    }
    expect(remaining).toBe(0)
    expect(
      Buffer.byteLength(JSON.stringify(MediaFormatsParamsSchema.parse(request)))
    ).toBe(MEDIA_FORMATS_LIMITS.paramsBytes)
    request.cookies.at(-1)!.value += 'x'
    expect(MediaFormatsParamsSchema.safeParse(request).success).toBe(false)
  })

  it('counts UTF-8 bytes rather than JavaScript string length', () => {
    const request = {
      url,
      cookies: Array.from({ length: 8 }, (_, index) => ({
        ...cookie,
        name: `c${index}`,
        value: '界'.repeat(3000),
      })),
    }
    expect(JSON.stringify(request).length).toBeLessThan(
      MEDIA_FORMATS_LIMITS.paramsBytes
    )
    expect(Buffer.byteLength(JSON.stringify(request))).toBeGreaterThan(
      MEDIA_FORMATS_LIMITS.paramsBytes
    )
    expect(MediaFormatsParamsSchema.safeParse(request).success).toBe(false)
  })

  it('returns safe validation messages without echoing credentials', () => {
    const result = MediaFormatsParamsSchema.safeParse({
      url,
      cookies: [{ ...cookie, value: 'SECRET_DO_NOT_ECHO\r\n' }],
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.message).not.toContain('SECRET_DO_NOT_ECHO')
  })
})

describe('Motrix quality-picker result contract', () => {
  it('accepts the desktop lister projection, including MP3 extraction', () => {
    const entries = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144].map(
      (height) => ({
        key: `${height}p`,
        kind: 'video',
        label: `${height}p`,
        height,
        ext: 'mp4',
      })
    )
    const result = MediaFormatsResultSchema.parse({
      available: true,
      title: 'Fixture',
      durationSec: 120,
      entries: [...entries, mp3],
    })
    expect(result.entries).toHaveLength(10)
  })

  it.each([
    'disabled',
    'not-allowed',
    'binary-missing',
    'unsupported',
    'failed',
    'vendor-new-reason',
  ])('accepts an extensible unavailable reason: %s', (reason) => {
    expect(
      MediaFormatsResultSchema.parse({ available: false, reason, entries: [] })
    ).toEqual({ available: false, reason, entries: [] })
  })

  it('rejects contradictory availability states', () => {
    for (const result of [
      { available: false, entries: [] },
      { available: false, reason: 'disabled', entries: [video] },
      { available: true, entries: [] },
      { available: false, reason: '/private/extractor/error.log', entries: [] },
    ])
      expect(MediaFormatsResultSchema.safeParse(result).success).toBe(false)
  })

  it.each([
    { ...video, key: 'bv*+ba/b' },
    { ...video, key: 'mp3' },
    { ...video, height: 720 },
    { ...video, key: '9999p', height: 9999 },
    { ...mp3, key: '1080p' },
    { ...video, fps: Number.POSITIVE_INFINITY },
    { ...video, sizeBytes: 0 },
  ])('rejects an invalid quality option: %j', (entry) => {
    expect(MediaFormatEntrySchema.safeParse(entry).success).toBe(false)
  })

  it('bounds options and rejects ambiguous repeated keys', () => {
    expect(
      MediaFormatsResultSchema.safeParse({
        available: true,
        entries: [video, video],
      }).success
    ).toBe(false)
    const entries = Array.from({ length: 65 }, (_, index) => ({
      ...video,
      key: `${100 + index}p`,
      height: 100 + index,
    }))
    expect(
      MediaFormatsResultSchema.safeParse({ available: true, entries }).success
    ).toBe(false)
  })

  it('strips forward-compatible result fields before serialization', () => {
    expect(
      MediaFormatsResultSchema.parse({
        available: true,
        title: 'Fixture',
        entries: [{ ...video, futureField: 'ignored' }],
        futureField: 'ignored',
      })
    ).toEqual({ available: true, title: 'Fixture', entries: [video] })
    expect(
      MediaFormatsResultSchema.parse({
        available: false,
        reason: 'failed',
        entries: [],
        stderr: 'not part of contract',
      })
    ).toEqual({ available: false, reason: 'failed', entries: [] })
  })

  it('keeps the maximum supported listing below the message budget', () => {
    const entries = Array.from({ length: 64 }, (_, index) => ({
      key: `${100 + index}p`,
      kind: 'video',
      label: '界'.repeat(128),
      height: 100 + index,
      fps: 1000,
      ext: 'x'.repeat(16),
      sizeBytes: Number.MAX_SAFE_INTEGER,
    }))
    const result = MediaFormatsResultSchema.parse({
      available: true,
      title: '界'.repeat(500),
      durationSec: Number.MAX_VALUE,
      entries,
    })
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      MEDIA_FORMATS_LIMITS.resultBytes
    )
  })
})

describe('media formats registration and negotiation', () => {
  it('publishes the shared schema without exposing an agent tool', () => {
    expect(Methods.MediaFormats).toBe('media/formats')
    expect(Tools[Methods.MediaFormats]).toMatchObject({
      agentFacing: false,
      paramsSchema: MediaFormatsParamsSchema,
      resultSchema: MediaFormatsResultSchema,
    })
    expect(
      toAgentToolCatalog().some((tool) => tool.name === Methods.MediaFormats)
    ).toBe(false)
    expect(() => z.toJSONSchema(MediaFormatsParamsSchema)).not.toThrow()
    expect(() => z.toJSONSchema(MediaFormatsResultSchema)).not.toThrow()
  })

  it.each([undefined, false, true])(
    'retains optional capability value %s',
    (mediaFormats) => {
      const hello = InitializeResultSchema.parse({
        protocolVersion: '1.0',
        server: { name: 'motrix', version: '2', runtime: 'electron' },
        capabilities: {
          ffmpegAvailable: true,
          selectionKinds: ['direct'],
          progress: true,
          cancellation: true,
          ...(mediaFormats === undefined ? {} : { mediaFormats }),
        },
        serverAdapters: [],
      })
      expect(hello.capabilities.mediaFormats).toBe(mediaFormats)
      expect(hello.protocolVersion).toBe('1.0')
    }
  )
})
