import { describe, expect, it } from 'vitest'
import { Methods } from '../methods.js'
import { DownloadAddParamsSchema } from '../schemas/download-add.js'
import { EngineStatusResultSchema } from '../schemas/engine.js'
import { InitializeParamsSchema } from '../schemas/initialize.js'
import { StatsResultSchema } from '../schemas/stats.js'
import {
  MdxpTaskSchema,
  MdxpTaskStatusSchema,
  TaskGetResultSchema,
  TaskListParamsSchema,
  TaskRevealParamsSchema,
} from '../schemas/task.js'
import {
  SERVER_INITIATED_METHODS,
  Tools,
  toAgentToolCatalog,
} from '../tools.js'

const sampleTask = {
  id: 't1',
  type: 'http',
  name: 'f.bin',
  status: 'downloading',
  progress: 0.5,
  bytesDone: 50,
  bytesTotal: 100,
  speedBps: 10,
  etaSec: 5,
  saveDir: '/d',
  error: null,
  createdAt: 1,
  finishedAt: null,
  finalPath: null,
}

describe('MDXP v1 task schemas', () => {
  it('MdxpTask round-trips (with + without bt)', () => {
    expect(MdxpTaskSchema.safeParse(sampleTask).success).toBe(true)
    expect(
      MdxpTaskSchema.safeParse({
        ...sampleTask,
        type: 'bt',
        infoHash: 'abc',
        bt: { peers: 1, seeds: 2, ratio: 0.5, trackers: ['udp://x'] },
      }).success
    ).toBe(true)
  })

  it('MdxpTask rejects an unknown / lossy-phase status', () => {
    expect(
      MdxpTaskSchema.safeParse({ ...sampleTask, status: 'muxing' }).success
    ).toBe(false)
  })

  it('MdxpTaskStatus is the 8-value control-plane enum', () => {
    expect(MdxpTaskStatusSchema.options).toEqual([
      'queued',
      'fetching_metadata',
      'downloading',
      'paused',
      'seeding',
      'finalizing',
      'completed',
      'error',
    ])
  })

  it('task/list params are strict (reject unknown keys)', () => {
    expect(
      TaskListParamsSchema.safeParse({ status: 'downloading' }).success
    ).toBe(true)
    expect(TaskListParamsSchema.safeParse({ bogus: 1 }).success).toBe(false)
  })

  it('task/get result allows null', () => {
    expect(TaskGetResultSchema.safeParse({ task: null }).success).toBe(true)
    expect(TaskGetResultSchema.safeParse({ task: sampleTask }).success).toBe(
      true
    )
  })

  it('task/reveal is a strict task-id-only protocol 1.0 request', () => {
    expect(Methods.TaskReveal).toBe('task/reveal')
    expect(TaskRevealParamsSchema.safeParse({ taskId: 't1' }).success).toBe(
      true
    )
    expect(
      TaskRevealParamsSchema.safeParse({ taskId: 't1', path: '/tmp/file' })
        .success
    ).toBe(false)
  })
})

describe('MDXP v1 stats/engine schemas', () => {
  it('StatsResult mirrors GlobalStats', () => {
    expect(
      StatsResultSchema.safeParse({
        totalDownloadSpeed: 1,
        totalUploadSpeed: 2,
        activeTasks: 3,
        waitingTasks: 4,
        stoppedTasks: 5,
      }).success
    ).toBe(true)
  })

  it('EngineStatusResult allows null featureReport and rejects a bad state', () => {
    expect(
      EngineStatusResultSchema.safeParse({
        state: 'ready',
        featureReport: null,
      }).success
    ).toBe(true)
    expect(
      EngineStatusResultSchema.safeParse({
        state: 'bogus',
        featureReport: null,
      }).success
    ).toBe(false)
  })
})

describe('download/add params', () => {
  it('accepts url / magnet / torrent variants', () => {
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'url',
        saveDir: '/d',
        uris: ['https://x/f'],
      }).success
    ).toBe(true)
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'magnet',
        saveDir: '/d',
        uri: 'magnet:?xt=urn:btih:abc',
      }).success
    ).toBe(true)
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'torrent',
        saveDir: '/d',
        base64: 'AAAA',
      }).success
    ).toBe(true)
  })

  it('rejects a non-magnet uri and unknown keys (strict)', () => {
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'magnet',
        saveDir: '/d',
        uri: 'http://x',
      }).success
    ).toBe(false)
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'url',
        saveDir: '/d',
        uris: ['https://x'],
        bogus: 1,
      }).success
    ).toBe(false)
  })

  it('accepts an optional idempotencyKey on all variants', () => {
    const idempotencyKey = '018f3b2e-4c5d-7aaa-bbbb-cccccccccccc'
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'url',
        saveDir: '/d',
        uris: ['https://x/f'],
        idempotencyKey,
      }).success
    ).toBe(true)
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'magnet',
        saveDir: '/d',
        uri: 'magnet:?xt=urn:btih:abc',
        idempotencyKey,
      }).success
    ).toBe(true)
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'torrent',
        saveDir: '/d',
        base64: 'AAAA',
        idempotencyKey,
      }).success
    ).toBe(true)
  })

  it('rejects an idempotencyKey shorter than 8 chars', () => {
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'url',
        saveDir: '/d',
        uris: ['https://x/f'],
        idempotencyKey: 'short',
      }).success
    ).toBe(false)
  })

  it('url variant rejects dangerous schemes (file/javascript/data)', () => {
    for (const uri of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,x',
    ]) {
      expect(
        DownloadAddParamsSchema.safeParse({
          kind: 'url',
          saveDir: '/d',
          uris: [uri],
        }).success
      ).toBe(false)
    }
    // ftp is a legitimate download scheme and is allowed.
    expect(
      DownloadAddParamsSchema.safeParse({
        kind: 'url',
        saveDir: '/d',
        uris: ['ftp://host/f'],
      }).success
    ).toBe(true)
  })
})

describe('initialize.client compat shim', () => {
  const extPayload = {
    protocolVersion: '1.0',
    client: {
      name: 'motrix-extension',
      version: '0.1',
      extensionId: 'abc',
      browser: 'chromium',
      browserVersion: '120',
      locale: 'en',
    },
    capabilities: {},
    adapters: [],
  }

  it('the shipped extension payload (no kind) still validates', () => {
    const r = InitializeParamsSchema.safeParse(extPayload)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.client.kind).toBe('extension')
  })

  it('a cli client validates', () => {
    expect(
      InitializeParamsSchema.safeParse({
        ...extPayload,
        client: { kind: 'cli', name: 'motrix-cli', version: '2.0' },
      }).success
    ).toBe(true)
  })

  it('rejects a non-1.0 protocolVersion', () => {
    expect(
      InitializeParamsSchema.safeParse({
        ...extPayload,
        protocolVersion: '2.0',
      }).success
    ).toBe(false)
  })
})

describe('Tools registry', () => {
  it('keys are exactly the client→server methods (single source)', () => {
    const serverInitiated = SERVER_INITIATED_METHODS as readonly string[]
    const expected = Object.values(Methods)
      .filter((m) => !serverInitiated.includes(m))
      .sort()
    expect(Object.keys(Tools).sort()).toEqual(expected)
  })

  it('every tool method is a valid Methods value', () => {
    const all = Object.values(Methods) as string[]
    for (const m of Object.keys(Tools)) expect(all).toContain(m)
  })

  it('toAgentToolCatalog emits JSON Schema for each agent-facing tool', () => {
    const cat = toAgentToolCatalog()
    expect(cat.length).toBeGreaterThan(0)
    for (const t of cat) {
      expect(typeof t.name).toBe('string')
      expect(t.inputSchema).toBeTypeOf('object')
      expect(t.outputSchema).toBeTypeOf('object')
    }
    const names = cat.map((t) => t.name)
    expect(names).toContain(Methods.DownloadAdd)
    expect(names).not.toContain(Methods.DownloadSubmit)
    expect(names).not.toContain(Methods.TaskReveal)
  })

  it('registers task/reveal as a user-gesture tool, not an agent tool', () => {
    const reveal = Tools[Methods.TaskReveal]
    expect(reveal).toBeDefined()
    expect(reveal?.method).toBe(Methods.TaskReveal)
    expect(reveal?.agentFacing).toBe(false)
    expect(reveal?.paramsSchema.safeParse({ taskId: 't1' }).success).toBe(true)
    expect(
      reveal?.paramsSchema.safeParse({ taskId: 't1', path: '/x' }).success
    ).toBe(false)
    expect(reveal?.resultSchema.safeParse({ ok: true }).success).toBe(true)
  })
})
