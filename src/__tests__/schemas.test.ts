import { describe, expect, it } from 'vitest'
import { Methods, Notifications } from '../methods.js'
import { ResourceSchema } from '../schemas/resource.js'
import { SelectionSchema } from '../schemas/selection.js'
import { MdxpTaskSchema } from '../schemas/task.js'

describe('Methods', () => {
  it('exports all spec-defined methods', () => {
    expect(Methods.MotrixInitialize).toBe('motrix/initialize')
    expect(Methods.DownloadSubmit).toBe('download/submit')
    expect(Methods.DownloadCancel).toBe('download/cancel')
    expect(Methods.UrlProbe).toBe('url/probe')
    expect(Methods.UrlResolve).toBe('url/resolve')
    expect(Methods.SystemPing).toBe('system/ping')
  })

  it('Methods object is frozen', () => {
    expect(Object.isFrozen(Methods)).toBe(true)
  })
})

describe('Notifications', () => {
  it('exports all spec-defined notification names', () => {
    expect(Notifications.MotrixInitialized).toBe('motrix/initialized')
    expect(Notifications.TaskProgress).toBe('$/task/progress')
    expect(Notifications.TaskCompleted).toBe('$/task/completed')
    expect(Notifications.TaskError).toBe('$/task/error')
    expect(Notifications.PairRevoked).toBe('$/pair/revoked')
    expect(Notifications.CancelRequest).toBe('$/cancelRequest')
  })

  it('Notifications object is frozen', () => {
    expect(Object.isFrozen(Notifications)).toBe(true)
  })
})

describe('ResourceSchema', () => {
  it('parses a minimal Resource', () => {
    const r = ResourceSchema.parse({
      url: 'https://example.com/video.mp4',
    })
    expect(r.headers).toEqual({})
    expect(r.cookies).toEqual([])
    expect(r.refererPolicy).toBe('strict-origin-when-cross-origin')
  })

  it('preserves headers and cookies', () => {
    const r = ResourceSchema.parse({
      url: 'https://example.com/video.mp4',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cookies: [
        {
          name: 'session',
          value: 'abc',
          domain: '.example.com',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
        },
      ],
    })
    expect(r.headers['User-Agent']).toBe('Mozilla/5.0')
    expect(r.cookies[0]?.name).toBe('session')
  })

  it('rejects non-http URL', () => {
    const r = ResourceSchema.safeParse({ url: 'ftp://example.com/file' })
    expect(r.success).toBe(false)
  })

  it('rejects malformed URL', () => {
    const r = ResourceSchema.safeParse({ url: 'not a url' })
    expect(r.success).toBe(false)
  })
})

describe('SelectionSchema', () => {
  const validResource = { url: 'https://example.com/x.mp4' }

  it('parses direct kind', () => {
    const s = SelectionSchema.parse({
      kind: 'direct',
      primary: validResource,
    })
    expect(s.kind).toBe('direct')
  })

  it('parses hls kind with container', () => {
    const s = SelectionSchema.parse({
      kind: 'hls',
      primary: validResource,
      container: 'mkv',
    })
    expect(s.kind === 'hls' && s.container).toBe('mkv')
  })

  it('hls kind defaults container to mp4', () => {
    const s = SelectionSchema.parse({
      kind: 'hls',
      primary: validResource,
    })
    expect(s.kind === 'hls' && s.container).toBe('mp4')
  })

  it('parses mux kind with video + audio', () => {
    const s = SelectionSchema.parse({
      kind: 'mux',
      video: validResource,
      audio: validResource,
    })
    expect(s.kind === 'mux' && s.container).toBe('mp4')
  })

  it('rejects unknown kind', () => {
    const r = SelectionSchema.safeParse({
      kind: 'sabr',
      primary: validResource,
    })
    expect(r.success).toBe(false)
  })

  it('mux kind rejects missing audio', () => {
    const r = SelectionSchema.safeParse({ kind: 'mux', video: validResource })
    expect(r.success).toBe(false)
  })

  it('parses magnet kind', () => {
    const s = SelectionSchema.parse({
      kind: 'magnet',
      uri: 'magnet:?xt=urn:btih:0123456789abcdef',
    })
    expect(s.kind === 'magnet' && s.uri).toBe(
      'magnet:?xt=urn:btih:0123456789abcdef'
    )
  })

  it('rejects magnet kind whose uri is not a magnet link', () => {
    const r = SelectionSchema.safeParse({
      kind: 'magnet',
      uri: 'https://example.com/x.torrent',
    })
    expect(r.success).toBe(false)
  })
})

describe('SelectionSchema dash', () => {
  it('parses a dash selection with default container mp4', () => {
    const s = SelectionSchema.parse({
      kind: 'dash',
      primary: { url: 'https://h.example/v.mpd' },
    })
    expect(s.kind).toBe('dash')
    if (s.kind === 'dash') expect(s.container).toBe('mp4')
  })
})

describe('InitializeResult selectionKinds', () => {
  it('accepts dash in selectionKinds', () => {
    const r = InitializeResultSchema.safeParse({
      protocolVersion: '1.0',
      server: { name: 'motrix', version: '1.0.0', runtime: 'electron' },
      capabilities: {
        ffmpegAvailable: true,
        selectionKinds: ['direct', 'hls', 'dash', 'mux'],
        progress: true,
        cancellation: true,
      },
      serverAdapters: [],
    })
    expect(r.success).toBe(true)
  })
})

import {
  InitializeParamsSchema,
  InitializeResultSchema,
} from '../schemas/initialize.js'

describe('InitializeParamsSchema', () => {
  it('parses minimum valid params', () => {
    const p = InitializeParamsSchema.parse({
      protocolVersion: '1.0',
      client: {
        name: 'motrix-extension',
        version: '0.1.0',
        extensionId: 'abc',
        browser: 'chromium',
        browserVersion: '120',
        locale: 'en-US',
      },
      capabilities: {},
      adapters: [],
    })
    expect(p.protocolVersion).toBe('1.0')
  })

  it('rejects non-1.0 protocolVersion', () => {
    const r = InitializeParamsSchema.safeParse({
      protocolVersion: '2.0',
      client: {
        name: 'x',
        version: '1',
        extensionId: 'a',
        browser: 'chromium',
        browserVersion: '1',
        locale: 'en',
      },
      capabilities: {},
      adapters: [],
    })
    expect(r.success).toBe(false)
  })

  it('preserves adapter declarations', () => {
    const p = InitializeParamsSchema.parse({
      protocolVersion: '1.0',
      client: {
        name: 'x',
        version: '1',
        extensionId: 'a',
        browser: 'firefox',
        browserVersion: '1',
        locale: 'en',
      },
      capabilities: { resolveUrl: true },
      adapters: [
        {
          id: 'youtube',
          version: '1.0',
          urlPatterns: ['*://*.youtube.com/*'],
          capabilities: ['resolve', 'sniff'],
        },
      ],
    })
    expect(p.adapters[0]?.id).toBe('youtube')
  })
})

describe('InitializeResultSchema', () => {
  it('parses minimum valid result', () => {
    const r = InitializeResultSchema.parse({
      protocolVersion: '1.0',
      server: { name: 'motrix', version: '2.0', runtime: 'electron' },
      capabilities: {
        ffmpegAvailable: true,
        selectionKinds: ['direct', 'hls', 'mux'],
        progress: true,
        cancellation: true,
      },
      serverAdapters: [],
    })
    expect(r.server.runtime).toBe('electron')
  })

  it('accepts optional pairToken', () => {
    const r = InitializeResultSchema.parse({
      protocolVersion: '1.0',
      server: { name: 'motrix', version: '2.0', runtime: 'server' },
      capabilities: {
        ffmpegAvailable: false,
        selectionKinds: ['direct'],
        progress: true,
        cancellation: false,
      },
      serverAdapters: [],
      pairToken: 'abc123',
    })
    expect(r.pairToken).toBe('abc123')
  })
})

import {
  DownloadCancelParamsSchema,
  DownloadCancelResultSchema,
  DownloadSubmitParamsSchema,
  DownloadSubmitResultSchema,
} from '../schemas/download.js'

describe('DownloadSubmit schemas', () => {
  it('parses direct kind submit', () => {
    const p = DownloadSubmitParamsSchema.parse({
      source: {
        pageUrl: 'https://example.com/page',
        pageTitle: 'Test',
        detectedAt: Date.now(),
      },
      selection: {
        kind: 'direct',
        primary: { url: 'https://example.com/file.mp4' },
      },
      meta: { suggestedFilename: 'file.mp4', qualityLabel: '720p' },
    })
    expect(p.selection.kind).toBe('direct')
  })

  it('parses a magnet selection submit', () => {
    const p = DownloadSubmitParamsSchema.parse({
      source: {
        pageUrl: 'https://example.com/p',
        pageTitle: 'P',
        detectedAt: 1,
      },
      selection: { kind: 'magnet', uri: 'magnet:?xt=urn:btih:abc' },
      meta: { suggestedFilename: 'magnet', qualityLabel: 'file' },
    })
    expect(p.selection.kind).toBe('magnet')
  })

  it('accepts an optional idempotencyKey', () => {
    const p = DownloadSubmitParamsSchema.parse({
      source: {
        pageUrl: 'https://example.com/page',
        pageTitle: 'Test',
        detectedAt: Date.now(),
      },
      selection: {
        kind: 'direct',
        primary: { url: 'https://example.com/file.mp4' },
      },
      meta: { suggestedFilename: 'file.mp4', qualityLabel: '720p' },
      idempotencyKey: '018f3b2e-4c5d-7aaa-bbbb-cccccccccccc',
    })
    expect(p.idempotencyKey).toBe('018f3b2e-4c5d-7aaa-bbbb-cccccccccccc')
  })

  it('rejects an idempotencyKey shorter than 8 chars', () => {
    const r = DownloadSubmitParamsSchema.safeParse({
      source: {
        pageUrl: 'https://example.com/page',
        pageTitle: 'Test',
        detectedAt: Date.now(),
      },
      selection: {
        kind: 'direct',
        primary: { url: 'https://example.com/file.mp4' },
      },
      meta: { suggestedFilename: 'file.mp4', qualityLabel: '720p' },
      idempotencyKey: 'short',
    })
    expect(r.success).toBe(false)
  })

  it('result must include taskId', () => {
    const r = DownloadSubmitResultSchema.parse({ taskId: 'task-1' })
    expect(r.taskId).toBe('task-1')
  })

  it('result rejects empty taskId', () => {
    const r = DownloadSubmitResultSchema.safeParse({ taskId: '' })
    expect(r.success).toBe(false)
  })
})

describe('DownloadCancel schemas', () => {
  it('params just need taskId', () => {
    const p = DownloadCancelParamsSchema.parse({ taskId: 'x' })
    expect(p.taskId).toBe('x')
  })

  it('result is fixed ok:true', () => {
    const r = DownloadCancelResultSchema.parse({ ok: true })
    expect(r.ok).toBe(true)
  })
})

import {
  CancelRequestParamsSchema,
  PairRevokedParamsSchema,
  TaskCompletedParamsSchema,
  TaskErrorParamsSchema,
  TaskProgressParamsSchema,
} from '../schemas/events.js'

describe('Task event schemas', () => {
  it('TaskProgress accepts known phases', () => {
    const p = TaskProgressParamsSchema.parse({
      taskId: 't1',
      bytesDone: 100,
      bytesTotal: 1000,
      speedBps: 50,
      etaSec: 18,
      phase: 'downloading',
    })
    expect(p.phase).toBe('downloading')
  })

  it('TaskProgress allows null bytesTotal', () => {
    const p = TaskProgressParamsSchema.parse({
      taskId: 't1',
      bytesDone: 100,
      bytesTotal: null,
      speedBps: 0,
      etaSec: null,
      phase: 'queued',
    })
    expect(p.bytesTotal).toBeNull()
  })

  it('TaskCompleted requires filePath', () => {
    const p = TaskCompletedParamsSchema.parse({
      taskId: 't1',
      filePath: '/tmp/x.mp4',
      durationMs: 5000,
    })
    expect(p.filePath).toBe('/tmp/x.mp4')
  })

  it('TaskError carries code + message', () => {
    const p = TaskErrorParamsSchema.parse({
      taskId: 't1',
      code: 'network.timeout',
      message: 'timed out',
    })
    expect(p.code).toBe('network.timeout')
  })
})

describe('MdxpTaskSchema errorCode', () => {
  const baseTask = {
    id: 't1',
    type: 'http',
    name: 'ubuntu.iso',
    status: 'downloading',
    progress: 0.5,
    bytesDone: 500,
    bytesTotal: 1000,
    speedBps: 100,
    etaSec: 5,
    saveDir: '/downloads',
    error: null,
    createdAt: 1000,
    finishedAt: null,
    finalPath: null,
  }

  it('parses with errorCode absent', () => {
    const t = MdxpTaskSchema.parse(baseTask)
    expect(t.errorCode).toBeUndefined()
  })

  it('parses with errorCode null', () => {
    const t = MdxpTaskSchema.parse({ ...baseTask, errorCode: null })
    expect(t.errorCode).toBeNull()
  })

  it('parses with a known errorCode', () => {
    const t = MdxpTaskSchema.parse({ ...baseTask, errorCode: 'DL_DISK_FULL' })
    expect(t.errorCode).toBe('DL_DISK_FULL')
  })

  it('parses with an unknown/future errorCode (open set)', () => {
    const t = MdxpTaskSchema.parse({ ...baseTask, errorCode: 'DL_FUTURE' })
    expect(t.errorCode).toBe('DL_FUTURE')
  })
})

describe('PairRevoked schema', () => {
  it('captures reason', () => {
    const p = PairRevokedParamsSchema.parse({ reason: 'user-action' })
    expect(p.reason).toBe('user-action')
  })
})

describe('CancelRequest schema', () => {
  it('matches LSP shape', () => {
    const p = CancelRequestParamsSchema.parse({ id: 'req-42' })
    expect(p.id).toBe('req-42')
  })
})

import {
  UrlProbeParamsSchema,
  UrlProbeResultSchema,
  UrlResolveParamsSchema,
  UrlResolveResultSchema,
} from '../schemas/url.js'

describe('UrlProbe schemas', () => {
  it('parses params with url only', () => {
    const p = UrlProbeParamsSchema.parse({ url: 'https://example.com' })
    expect(p.url).toBe('https://example.com')
  })

  it('result handled=false with no adapter', () => {
    const r = UrlProbeResultSchema.parse({ handled: false })
    expect(r.handled).toBe(false)
  })

  it('result with adapter info', () => {
    const r = UrlProbeResultSchema.parse({
      handled: true,
      adapterId: 'youtube',
      confidence: 'high',
    })
    expect(r.adapterId).toBe('youtube')
  })
})

describe('UrlResolve schemas', () => {
  it('parses params with preferences', () => {
    const p = UrlResolveParamsSchema.parse({
      url: 'https://example.com',
      preferences: { maxQuality: '1080p', includeAudio: true },
    })
    expect(p.preferences?.maxQuality).toBe('1080p')
  })

  it('result includes selections array', () => {
    const r = UrlResolveResultSchema.parse({
      selections: [
        {
          kind: 'direct',
          primary: { url: 'https://cdn.example.com/x.mp4' },
          quality: '720p',
        },
      ],
      meta: { title: 'Test Video' },
      extractedBy: {
        adapterId: 'youtube',
        adapterVersion: '1.0',
        extractedAt: Date.now(),
      },
    })
    expect(r.selections).toHaveLength(1)
  })

  it('result accepts subtitles', () => {
    const r = UrlResolveResultSchema.parse({
      selections: [],
      meta: { title: 'X' },
      subtitles: [
        {
          languageCode: 'en',
          languageName: 'English',
          url: 'https://example.com/cap.vtt',
          format: 'vtt',
        },
      ],
      extractedBy: {
        adapterId: 'youtube',
        adapterVersion: '1.0',
        extractedAt: 0,
      },
    })
    expect(r.subtitles?.[0]?.format).toBe('vtt')
  })
})

import {
  SystemPingParamsSchema,
  SystemPingResultSchema,
} from '../schemas/system.js'

describe('SystemPing schemas', () => {
  it('params has sentAt', () => {
    const p = SystemPingParamsSchema.parse({ sentAt: 1000 })
    expect(p.sentAt).toBe(1000)
  })

  it('result has sentAt and recvAt for RTT calc', () => {
    const r = SystemPingResultSchema.parse({ sentAt: 1000, recvAt: 1010 })
    expect(r.recvAt - r.sentAt).toBe(10)
  })
})

describe('schemas/index aggregation', () => {
  it('re-exports all schemas', async () => {
    const mod = await import('../schemas/index.js')
    expect(mod.ResourceSchema).toBeDefined()
    expect(mod.SelectionSchema).toBeDefined()
    expect(mod.InitializeParamsSchema).toBeDefined()
    expect(mod.DownloadSubmitParamsSchema).toBeDefined()
    expect(mod.UrlResolveParamsSchema).toBeDefined()
    expect(mod.TaskProgressParamsSchema).toBeDefined()
    expect(mod.SystemPingParamsSchema).toBeDefined()
  })
})
