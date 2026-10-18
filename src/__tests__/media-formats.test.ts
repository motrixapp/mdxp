import { describe, expect, it } from 'vitest'
import {
  InitializeResultSchema,
  MediaFormatsParamsSchema,
  MediaFormatsResultSchema,
  Methods,
  Tools,
  toAgentToolCatalog,
} from '../index.js'

const entry = {
  key: '1080p',
  kind: 'video' as const,
  label: '1080p',
  height: 1080,
  fps: 60,
  ext: 'mp4',
  sizeBytes: 734_003_200,
}

const serverHello = {
  protocolVersion: '1.0',
  server: { name: 'motrix', version: '2', runtime: 'electron' },
  capabilities: {
    ffmpegAvailable: true,
    selectionKinds: ['direct'],
    progress: true,
    cancellation: true,
  },
  serverAdapters: [],
}

describe('media/formats params', () => {
  it('accepts a page url, with or without session cookies', () => {
    expect(
      MediaFormatsParamsSchema.safeParse({ url: 'https://youtu.be/x' }).success
    ).toBe(true)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'https://www.youtube.com/watch?v=x',
        cookies: [{ name: 'SID', value: 'abc' }],
      }).success
    ).toBe(true)
  })

  it('rejects unknown params (strict)', () => {
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'https://youtu.be/x',
        formatSelector: 'bv*+ba/b',
      }).success
    ).toBe(false)
  })

  it('rejects non-http(s) urls — the host fetches this url itself', () => {
    for (const url of [
      'file:///etc/passwd',
      'data:text/plain,x',
      'javascript:alert(1)',
      'ftp://host/f',
    ]) {
      expect(MediaFormatsParamsSchema.safeParse({ url }).success).toBe(false)
    }
  })

  it('requires a non-empty cookie name', () => {
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'https://youtu.be/x',
        cookies: [{ name: '', value: 'v' }],
      }).success
    ).toBe(false)
  })

  it('bounds the cookie list so header growth stays finite', () => {
    const cookies = Array.from({ length: 256 }, (_, i) => ({
      name: `c${i}`,
      value: 'v',
    }))
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'https://youtu.be/x',
        cookies,
      }).success
    ).toBe(true)
    expect(
      MediaFormatsParamsSchema.safeParse({
        url: 'https://youtu.be/x',
        cookies: [...cookies, { name: 'extra', value: 'v' }],
      }).success
    ).toBe(false)
  })
})

describe('media/formats result', () => {
  it('accepts an available listing', () => {
    const r = MediaFormatsResultSchema.safeParse({
      available: true,
      title: 'Sample clip',
      durationSec: 372,
      entries: [entry, { key: 'mp3', kind: 'audio', label: 'MP3' }],
    })
    expect(r.success).toBe(true)
  })

  it('accepts an unavailable listing with empty entries', () => {
    expect(
      MediaFormatsResultSchema.safeParse({
        available: false,
        reason: 'not-allowed',
        entries: [],
      }).success
    ).toBe(true)
  })

  it('rejects a raw extractor selector as a quality key', () => {
    for (const key of ['bestvideo+bestaudio', 'bv*+ba/b', '137', '']) {
      expect(
        MediaFormatsResultSchema.safeParse({
          available: true,
          entries: [{ ...entry, key }],
        }).success
      ).toBe(false)
    }
  })

  it('rejects an unknown kind', () => {
    expect(
      MediaFormatsResultSchema.safeParse({
        available: true,
        entries: [{ ...entry, kind: 'subtitle' }],
      }).success
    ).toBe(false)
  })

  it('strips unknown result fields (forward-compatible)', () => {
    const parsed = MediaFormatsResultSchema.parse({
      available: true,
      entries: [entry],
      addedByANewerServer: 'ignored',
    })
    expect(parsed.entries).toHaveLength(1)
    expect('addedByANewerServer' in parsed).toBe(false)
  })
})

describe('media/formats registration + exposure', () => {
  it('is a non-agent-facing client→server method', () => {
    expect(Methods.MediaFormats).toBe('media/formats')
    const tool = Tools[Methods.MediaFormats]
    expect(tool?.method).toBe(Methods.MediaFormats)
    expect(tool?.agentFacing).toBe(false)
    expect(
      tool?.paramsSchema.safeParse({ url: 'https://youtu.be/x' }).success
    ).toBe(true)
    expect(
      tool?.resultSchema.safeParse({ available: true, entries: [entry] })
        .success
    ).toBe(true)
  })

  it('stays off the unary agent tool catalog', () => {
    expect(
      toAgentToolCatalog().some((t) => t.name === Methods.MediaFormats)
    ).toBe(false)
  })

  it('requires negotiated support; absent means unsupported', () => {
    expect(
      InitializeResultSchema.parse(serverHello).capabilities.mediaFormats
    ).not.toBe(true)
    expect(
      InitializeResultSchema.parse({
        ...serverHello,
        capabilities: { ...serverHello.capabilities, mediaFormats: true },
      }).capabilities.mediaFormats
    ).toBe(true)
  })
})
