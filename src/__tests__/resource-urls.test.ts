import { describe, expect, it } from 'vitest'
import { DownloadSubmitParamsSchema } from '../schemas/download.js'
import { ResourceSchema } from '../schemas/resource.js'

describe('download resource URLs', () => {
  it.each([
    'http://172.16.50.14/file.zip',
    'https://192.168.1.10:8443/file.zip',
    'http://10.0.0.1/file.zip',
    'http://127.0.0.1:8080/file.zip',
    'https://8.8.8.8/file.zip',
    'http://[::1]:8080/file.zip',
    'https://[2001:db8::1]/file.zip',
    'http://localhost:8080/file.zip',
    'http://nas/file.zip',
    'http://nas.local/file.zip',
    'https://example.com/file.zip',
    'https://例子.测试/file.zip',
    'https://xn--fsqu00a.xn--0zwm56d/file.zip',
    'http://172.16.50.14/My%20Files/file.zip?token=a%2Bb&part=1',
  ])('accepts an HTTP(S) download without rewriting its URL: %s', (url) => {
    expect(ResourceSchema.parse({ url }).url).toBe(url)
  })

  it.each([
    'ftp://172.16.50.14/file.zip',
    'file:///tmp/file.zip',
    'data:text/plain,hello',
    'javascript:alert(1)',
    'ws://localhost/file.zip',
    '//172.16.50.14/file.zip',
    '/file.zip',
    'http://[broken/file.zip',
    'http://256.256.256.256/file.zip',
    'not a url',
  ])('rejects unsupported protocols and malformed URLs: %s', (url) => {
    expect(ResourceSchema.safeParse({ url }).success).toBe(false)
  })

  it.each([
    { kind: 'direct', primary: { url: 'http://172.16.50.14/file.zip' } },
    { kind: 'hls', primary: { url: 'http://nas/playlist.m3u8' } },
    { kind: 'dash', primary: { url: 'http://[::1]/manifest.mpd' } },
    {
      kind: 'mux',
      video: { url: 'http://192.168.1.10/video.mp4' },
      audio: { url: 'http://localhost/audio.m4a' },
    },
  ])('accepts local resources in a $kind submission', (selection) => {
    const params = {
      source: {
        pageUrl: 'http://172.16.50.14/',
        pageTitle: 'Local downloads',
        detectedAt: 0,
      },
      selection,
      meta: { suggestedFilename: 'download', qualityLabel: '' },
    }
    expect(DownloadSubmitParamsSchema.parse(params)).toMatchObject(params)
  })
})
