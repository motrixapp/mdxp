import { PassThrough } from 'node:stream'
import * as legacy from '@motrix/mdxp-legacy/node'
import { describe, expect, it } from 'vitest'
import * as current from '../node.js'

const advertisement = {
  version: 1,
  instanceId: 'c2b6a2d2-430c-4bc1-bdb0-c10f35004c90',
  maxPreparedTtlMs: 30_000,
  acceptingNew: true,
}
const initialize = {
  protocolVersion: '1.0',
  server: { name: 'Motrix', version: 'test', runtime: 'electron' },
  capabilities: {
    ffmpegAvailable: false,
    selectionKinds: ['direct'],
    progress: true,
    cancellation: true,
  },
  serverAdapters: [],
}
const download = {
  source: { pageUrl: 'https://example.test/', pageTitle: '', detectedAt: 42 },
  selection: {
    kind: 'direct',
    primary: { url: 'http://127.0.0.1/archive.zip' },
  },
  meta: { suggestedFilename: 'archive.zip', qualityLabel: '' },
  idempotencyKey: 'legacy-operation',
}

// Wire compatibility with the published 0.8.1 SDK, not a copied legacy schema.
// These peers are fixtures; production server route retention still needs E2E.
describe('independent extension and host upgrades', () => {
  it.each([
    {
      name: 'old extension / old host',
      clientSdk: legacy,
      serverSdk: legacy,
      capability: undefined,
    },
    {
      name: 'old extension / upgraded host',
      clientSdk: legacy,
      serverSdk: current,
      capability: advertisement,
    },
    {
      name: 'new extension / old host',
      clientSdk: current,
      serverSdk: legacy,
      capability: undefined,
    },
    {
      name: 'new extension / new host with rollout disabled',
      clientSdk: current,
      serverSdk: current,
      capability: { ...advertisement, acceptingNew: false },
    },
    {
      name: 'new extension / future handoff host',
      clientSdk: current,
      serverSdk: current,
      capability: { ...advertisement, version: 2 },
    },
  ])(
    '$name retains initialize and download/submit',
    async ({ clientSdk, serverSdk, capability }) => {
      const requests = new PassThrough()
      const replies = new PassThrough()
      const client = clientSdk.createMdxpConnection(
        new clientSdk.StreamMessageReader(replies),
        new clientSdk.StreamMessageWriter(requests)
      )
      const server = serverSdk.createMdxpConnection(
        new serverSdk.StreamMessageReader(requests),
        new serverSdk.StreamMessageWriter(replies)
      )
      let submits = 0
      server.onRequest('motrix/initialize', (params) => {
        expect(serverSdk.InitializeParamsSchema.parse(params).client.kind).toBe(
          'extension'
        )
        // Preserve the future capability on the wire to test the client's parser.
        return {
          ...serverSdk.InitializeResultSchema.parse(initialize),
          capabilities: {
            ...serverSdk.InitializeResultSchema.parse(initialize).capabilities,
            ...(capability ? { downloadHandoff: capability } : {}),
          },
        }
      })
      server.onRequest('download/submit', (params) => {
        expect(serverSdk.DownloadSubmitParamsSchema.parse(params)).toEqual(
          current.DownloadSubmitParamsSchema.parse(download)
        )
        submits += 1
        return { taskId: 'legacy-task' }
      })
      client.listen()
      server.listen()
      try {
        const reply = await client.sendRequest(
          'motrix/initialize',
          clientSdk.InitializeParamsSchema.parse({
            protocolVersion: '1.0',
            client: {
              name: 'extension',
              version: 'test',
              extensionId: 'synthetic',
              browser: 'firefox',
              browserVersion: '143',
              locale: 'en',
            },
            capabilities: { submitDownload: true },
            adapters: [],
          })
        )
        const parsed = clientSdk.InitializeResultSchema.parse(reply)
        const capability =
          'downloadHandoff' in parsed.capabilities
            ? parsed.capabilities.downloadHandoff
            : undefined
        if (clientSdk === current)
          expect(current.canStartDownloadHandoff(capability, true)).toBe(false)
        const submitted = await client.sendRequest(
          'download/submit',
          clientSdk.DownloadSubmitParamsSchema.parse(download)
        )
        expect(clientSdk.DownloadSubmitResultSchema.parse(submitted)).toEqual({
          taskId: 'legacy-task',
        })
        expect(submits).toBe(1)
      } finally {
        client.dispose()
        server.dispose()
        requests.destroy()
        replies.destroy()
      }
    }
  )

  it('requires both gates for new operations and defaults the server gate off', () => {
    expect(current.canStartDownloadHandoff(advertisement)).toBe(false)
    expect(current.canStartDownloadHandoff(advertisement, false)).toBe(false)
    expect(current.canStartDownloadHandoff(advertisement, true)).toBe(true)
    for (const capability of [
      undefined,
      {},
      { ...advertisement, acceptingNew: false },
      { ...advertisement, acceptingNew: undefined },
      { ...advertisement, version: 2 },
      { ...advertisement, instanceId: '' },
    ])
      expect(current.canStartDownloadHandoff(capability, true)).toBe(false)
  })

  it('does not turn an invalid base handshake into a valid one', () => {
    expect(
      current.InitializeResultSchema.safeParse({
        ...initialize,
        protocolVersion: '2.0',
        capabilities: {
          ...initialize.capabilities,
          downloadHandoff: advertisement,
        },
      }).success
    ).toBe(false)
    expect(
      current.InitializeResultSchema.safeParse({
        ...initialize,
        capabilities: { downloadHandoff: advertisement },
      }).success
    ).toBe(false)
  })
})
