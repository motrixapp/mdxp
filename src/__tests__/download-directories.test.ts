import { describe, expect, it } from 'vitest'
import {
  DownloadDirectoriesParamsSchema,
  DownloadDirectoriesResultSchema,
  DownloadSubmitParamsSchema,
  InitializeResultSchema,
  Methods,
  Tools,
  toAgentToolCatalog,
} from '../index.js'

const submit = {
  source: { pageUrl: 'https://example.test/', pageTitle: '', detectedAt: 0 },
  selection: {
    kind: 'magnet',
    uri: 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789',
  },
  meta: { suggestedFilename: '', qualityLabel: '' },
}
describe('extension download directories', () => {
  it('retains explicit destinations and remains compatible with old submissions', () => {
    expect(DownloadSubmitParamsSchema.parse(submit).saveDir).toBeUndefined()
    expect(
      DownloadSubmitParamsSchema.parse({ ...submit, saveDir: '/downloads' })
        .saveDir
    ).toBe('/downloads')
  })
  it.each(['', 'x'.repeat(4097), '/tmp/\0file'])(
    'rejects invalid path %s',
    (saveDir) => {
      expect(
        DownloadSubmitParamsSchema.safeParse({ ...submit, saveDir }).success
      ).toBe(false)
    }
  )
  it('bounds directory disclosure and forbids directory browsing params', () => {
    expect(
      DownloadDirectoriesParamsSchema.safeParse({ path: '/' }).success
    ).toBe(false)
    expect(
      DownloadDirectoriesResultSchema.safeParse({
        defaultSaveDir: null,
        favorites: [],
        recent: [],
      }).success
    ).toBe(true)
    expect(
      DownloadDirectoriesResultSchema.safeParse({
        defaultSaveDir: '/d',
        favorites: Array(21).fill('/d'),
        recent: [],
      }).success
    ).toBe(false)
    expect(
      DownloadDirectoriesResultSchema.safeParse({
        defaultSaveDir: '/d',
        favorites: [],
        recent: Array(11).fill('/d'),
      }).success
    ).toBe(false)
  })
  it('requires explicit negotiated support and is not agent-facing', () => {
    const old = {
      protocolVersion: '1.0',
      server: { name: 'motrix', version: '2', runtime: 'electron' },
      capabilities: {
        ffmpegAvailable: false,
        selectionKinds: ['direct'],
        progress: true,
        cancellation: true,
      },
      serverAdapters: [],
    }
    expect(
      InitializeResultSchema.parse(old).capabilities.downloadDirectories
    ).not.toBe(true)
    expect(
      InitializeResultSchema.parse({
        ...old,
        capabilities: { ...old.capabilities, downloadDirectories: true },
      }).capabilities.downloadDirectories
    ).toBe(true)
    expect(Tools[Methods.DownloadDirectories]?.agentFacing).toBe(false)
    expect(
      toAgentToolCatalog().some(
        (tool) => tool.name === Methods.DownloadDirectories
      )
    ).toBe(false)
  })
})
