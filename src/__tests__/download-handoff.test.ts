import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  canonicalDownloadHandoffPayload,
  DownloadHandoffAbortResultSchema,
  DownloadHandoffCapabilitySchema,
  DownloadHandoffCommitParamsSchema,
  DownloadHandoffCommitResultSchema,
  DownloadHandoffPayloadSchema,
  DownloadHandoffPrepareParamsSchema,
  DownloadHandoffPrepareResultSchema,
  DownloadHandoffStatusResultSchema,
  DownloadSubmitParamsSchema,
  ErrorCodes,
  InitializeResultSchema,
  Methods,
  Tools,
  toAgentToolCatalog,
} from '../index.js'

const key = {
  instanceId: 'c2b6a2d2-430c-4bc1-bdb0-c10f35004c90',
  operationId: '501e03a1-1c59-4c81-8dad-e670218d81b1',
}
const download = {
  source: {
    pageUrl: 'https://example.test/',
    pageTitle: '下载',
    detectedAt: 42,
  },
  selection: {
    kind: 'direct' as const,
    primary: { url: 'http://127.0.0.1/file' },
  },
  meta: { suggestedFilename: '报告.zip', qualityLabel: '' },
}
const hash = (value: unknown) =>
  createHash('sha256')
    .update(canonicalDownloadHandoffPayload(value))
    .digest('hex')
const prepared = {
  ...key,
  state: 'prepared',
  taskId: 'reserved-1',
  payloadHash: hash(download),
  expiresAt: 1000,
}
const committed = {
  ...key,
  state: 'committed',
  taskId: prepared.taskId,
  payloadHash: prepared.payloadHash,
}
const oldInitialize = {
  protocolVersion: '1.0',
  server: { name: 'Motrix', version: '2', runtime: 'server' },
  capabilities: {
    ffmpegAvailable: false,
    selectionKinds: ['direct'],
    progress: false,
    cancellation: false,
  },
  serverAdapters: [],
}

describe('handoff negotiation and payload', () => {
  it('does not enable handoff on existing peers or change legacy submit', () => {
    expect(
      InitializeResultSchema.parse(oldInitialize).capabilities.downloadHandoff
    ).toBeUndefined()
    expect(
      DownloadSubmitParamsSchema.parse(download).idempotencyKey
    ).toBeUndefined()
    expect(
      DownloadHandoffPrepareParamsSchema.parse({ ...key, download }).download
        .selection.kind
    ).toBe('direct')
  })
  it('requires version, durable instance identity and bounded preparation lifetime', () => {
    const capability = {
      version: 1,
      instanceId: key.instanceId,
      maxPreparedTtlMs: 30_000,
    }
    const parse = (value: unknown) =>
      InitializeResultSchema.safeParse({
        ...oldInitialize,
        capabilities: { ...oldInitialize.capabilities, downloadHandoff: value },
      })
    expect(parse(capability).success).toBe(true)
    for (const value of [
      true,
      {},
      { ...capability, version: 2 },
      { ...capability, instanceId: '' },
      { ...capability, maxPreparedTtlMs: 0 },
      { ...capability, maxPreparedTtlMs: 120_001 },
    ]) {
      expect(DownloadHandoffCapabilitySchema.safeParse(value).success).toBe(
        false
      )
      const result = parse(value)
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data.capabilities.downloadHandoff).toBeUndefined()
    }
  })
  it.each(['magnet', 'hls', 'dash', 'mux'])(
    'does not silently widen v1 to %s',
    (kind) => {
      expect(
        DownloadHandoffPayloadSchema.safeParse({
          ...download,
          selection: { ...download.selection, kind },
        }).success
      ).toBe(false)
    }
  )
  it.each([
    'blob:https://example.test/id',
    'data:text/plain,a',
    'file:///tmp/a',
    'ftp://example.test/a',
  ])('leaves unsupported source %s outside handoff', (url) => {
    expect(
      DownloadHandoffPayloadSchema.safeParse({
        ...download,
        selection: { ...download.selection, primary: { url } },
      }).success
    ).toBe(false)
  })
  it.each(['method', 'body', 'postData'])(
    'rejects %s instead of silently converting a request to GET',
    (field) => {
      for (const input of [
        { ...download, [field]: 'POST' },
        { ...download, selection: { ...download.selection, [field]: 'POST' } },
        {
          ...download,
          selection: {
            ...download.selection,
            primary: { ...download.selection.primary, [field]: 'POST' },
          },
        },
      ])
        expect(DownloadHandoffPayloadSchema.safeParse(input).success).toBe(
          false
        )
    }
  )
  it('has one operation key and no caller-supplied principal', () => {
    for (const input of [
      { ...key, clientId: 'other', download },
      { ...key, operationId: '', download },
      { ...key, download: { ...download, idempotencyKey: 'another-key' } },
    ])
      expect(DownloadHandoffPrepareParamsSchema.safeParse(input).success).toBe(
        false
      )
  })
  it('binds commit to the previously approved payload hash', () => {
    expect(DownloadHandoffCommitParamsSchema.safeParse(key).success).toBe(false)
    expect(
      DownloadHandoffCommitParamsSchema.safeParse({
        ...key,
        payloadHash: prepared.payloadHash,
      }).success
    ).toBe(true)
    expect(
      DownloadHandoffCommitParamsSchema.safeParse({
        ...key,
        payloadHash: 'bad',
      }).success
    ).toBe(false)
  })
})

describe('method-specific outcomes', () => {
  it('allows prepared only before commit and requires stable task/hash evidence', () => {
    expect(DownloadHandoffPrepareResultSchema.parse(prepared)).toEqual(prepared)
    expect(DownloadHandoffStatusResultSchema.parse(prepared)).toEqual(prepared)
    expect(DownloadHandoffCommitResultSchema.safeParse(prepared).success).toBe(
      false
    )
    expect(DownloadHandoffAbortResultSchema.safeParse(prepared).success).toBe(
      false
    )
    for (const invalid of [
      { ...prepared, taskId: '' },
      { ...prepared, payloadHash: undefined },
      { ...prepared, expiresAt: -1 },
    ])
      expect(
        DownloadHandoffPrepareResultSchema.safeParse(invalid).success
      ).toBe(false)
  })
  it('returns committed from repeated prepare, commit, status, or a losing abort', () => {
    for (const schema of [
      DownloadHandoffPrepareResultSchema,
      DownloadHandoffCommitResultSchema,
      DownloadHandoffStatusResultSchema,
      DownloadHandoffAbortResultSchema,
    ])
      expect(schema.parse(committed)).toEqual(committed)
  })
  it.each(['aborted', 'expired'])(
    'keeps %s terminal across all method results',
    (state) => {
      for (const schema of [
        DownloadHandoffPrepareResultSchema,
        DownloadHandoffCommitResultSchema,
        DownloadHandoffStatusResultSchema,
        DownloadHandoffAbortResultSchema,
      ]) {
        expect(schema.parse({ ...key, state })).toEqual({ ...key, state })
        expect(
          schema.safeParse({ ...key, state, taskId: 'must-not-activate' })
            .success
        ).toBe(false)
      }
    }
  )
  it('distinguishes a status/commit miss from the durable tombstone required by abort', () => {
    const miss = { ...key, state: 'not-found' }
    expect(DownloadHandoffStatusResultSchema.parse(miss)).toEqual(miss)
    expect(DownloadHandoffCommitResultSchema.parse(miss)).toEqual(miss)
    expect(DownloadHandoffPrepareResultSchema.safeParse(miss).success).toBe(
      false
    )
    expect(DownloadHandoffAbortResultSchema.safeParse(miss).success).toBe(false)
  })
  it('rejects malformed or ambiguous results instead of silently discarding fields', () => {
    for (const result of [
      { ...prepared, state: 'unknown' },
      { ...prepared, instanceId: '' },
      { ...committed, expiresAt: 1000 },
      { ...key, state: 'not-found', taskId: 'task' },
    ])
      expect(DownloadHandoffStatusResultSchema.safeParse(result).success).toBe(
        false
      )
  })
})

describe('shared immutable payload encoding', () => {
  it('normalizes omitted defaults and object insertion order identically', () => {
    const normalized = DownloadHandoffPayloadSchema.parse(download)
    const reordered = {
      meta: normalized.meta,
      selection: {
        primary: {
          cookies: [],
          refererPolicy: 'strict-origin-when-cross-origin',
          headers: {},
          url: download.selection.primary.url,
        },
        kind: 'direct',
      },
      source: {
        detectedAt: 42,
        pageTitle: '下载',
        pageUrl: 'https://example.test/',
      },
    }
    expect(canonicalDownloadHandoffPayload(reordered)).toBe(
      canonicalDownloadHandoffPayload(download)
    )
    expect(hash(reordered)).toBe(hash(download))
    expect(JSON.parse(canonicalDownloadHandoffPayload(download))).toEqual(
      normalized
    )
  })
  it('has a stable wire vector for non-ASCII metadata and normalized defaults', () => {
    expect(canonicalDownloadHandoffPayload(download)).toBe(
      '{"meta":{"qualityLabel":"","suggestedFilename":"报告.zip"},"selection":{"kind":"direct","primary":{"cookies":[],"headers":{},"refererPolicy":"strict-origin-when-cross-origin","url":"http://127.0.0.1/file"}},"source":{"detectedAt":42,"pageTitle":"下载","pageUrl":"https://example.test/"}}'
    )
  })
  it('binds filename, directory, request headers, cookies and source URL', () => {
    const variants = [
      { ...download, saveDir: '/different' },
      {
        ...download,
        meta: { ...download.meta, suggestedFilename: 'other.zip' },
      },
      {
        ...download,
        selection: {
          ...download.selection,
          primary: {
            ...download.selection.primary,
            headers: { Authorization: 'synthetic' },
          },
        },
      },
      {
        ...download,
        selection: {
          ...download.selection,
          primary: {
            ...download.selection.primary,
            cookies: [{ name: 'a', value: 'b', domain: 'example.test' }],
          },
        },
      },
      {
        ...download,
        selection: {
          ...download.selection,
          primary: { url: 'https://example.test/different' },
        },
      },
    ]
    for (const value of variants) expect(hash(value)).not.toBe(hash(download))
  })
  it('does not mutate input and rejects unknown options before fingerprinting', () => {
    const original = structuredClone(download)
    canonicalDownloadHandoffPayload(download)
    expect(download).toEqual(original)
    expect(() =>
      canonicalDownloadHandoffPayload({ ...download, overwrite: true })
    ).toThrow()
  })
})

it('registers all four methods as extension-only, with distinct error codes', () => {
  for (const method of [
    Methods.DownloadHandoffPrepare,
    Methods.DownloadHandoffCommit,
    Methods.DownloadHandoffStatus,
    Methods.DownloadHandoffAbort,
  ]) {
    expect(Tools[method]?.agentFacing).toBe(false)
    expect(Tools[method]?.paramsSchema).toBeDefined()
    expect(Tools[method]?.resultSchema).toBeDefined()
    expect(toAgentToolCatalog().some((tool) => tool.name === method)).toBe(
      false
    )
  }
  expect(new Set(Object.values(ErrorCodes)).size).toBe(
    Object.values(ErrorCodes).length
  )
})
