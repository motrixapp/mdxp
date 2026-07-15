import { describe, expect, it } from 'vitest'
import {
  ErrorCodes,
  isMotrixError,
  isProtocolError,
  makeMdxpError,
} from '../errors.js'

describe('ErrorCodes', () => {
  it('exposes JSON-RPC reserved codes', () => {
    expect(ErrorCodes.ParseError).toBe(-32700)
    expect(ErrorCodes.InvalidRequest).toBe(-32600)
    expect(ErrorCodes.MethodNotFound).toBe(-32601)
    expect(ErrorCodes.InvalidParams).toBe(-32602)
    expect(ErrorCodes.InternalError).toBe(-32603)
    expect(ErrorCodes.RequestCancelled).toBe(-32800)
  })

  it('exposes Motrix-defined codes in -32000..-32099 range', () => {
    expect(ErrorCodes.AdapterError).toBe(-32001)
    expect(ErrorCodes.ResourceUnavailable).toBe(-32002)
    expect(ErrorCodes.PermissionDenied).toBe(-32003)
    expect(ErrorCodes.RateLimited).toBe(-32004)
    expect(ErrorCodes.CapabilityNotSupported).toBe(-32005)
    expect(ErrorCodes.PairRevoked).toBe(-32006)
  })
})

describe('isProtocolError / isMotrixError', () => {
  it('classifies JSON-RPC reserved codes as protocol', () => {
    expect(isProtocolError(-32601)).toBe(true)
    expect(isMotrixError(-32601)).toBe(false)
  })

  it('classifies -32000..-32099 as motrix', () => {
    expect(isMotrixError(-32001)).toBe(true)
    expect(isProtocolError(-32001)).toBe(false)
  })

  it('classifies unknown codes as neither', () => {
    expect(isProtocolError(1)).toBe(false)
    expect(isMotrixError(1)).toBe(false)
  })
})

describe('makeMdxpError', () => {
  it('creates error with code + message', () => {
    const e = makeMdxpError(ErrorCodes.AdapterError, 'YouTube failed')
    expect(e.code).toBe(-32001)
    expect(e.message).toBe('YouTube failed')
  })

  it('attaches appCode and context', () => {
    const e = makeMdxpError(ErrorCodes.AdapterError, 'YouTube failed', {
      appCode: 'youtube.video_unavailable',
      retryable: false,
      context: { videoId: 'abc' },
    })
    expect(e.data?.appCode).toBe('youtube.video_unavailable')
    expect(e.data?.context?.videoId).toBe('abc')
  })
})
