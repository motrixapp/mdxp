// MDXP error code model — see docs/01-protocol-mdxp.md §8

export const ErrorCodes = Object.freeze({
  // JSON-RPC 2.0 reserved (-32768 to -32000)
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  RequestCancelled: -32800, // LSP extension

  // Motrix-defined (-32000 to -32099, JSON-RPC server-implementation reserved)
  AdapterError: -32001,
  ResourceUnavailable: -32002,
  PermissionDenied: -32003,
  RateLimited: -32004,
  CapabilityNotSupported: -32005,
  PairRevoked: -32006,
  HandoffInstanceChanged: -32007,
  HandoffPayloadConflict: -32008,
} as const)

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/** True for JSON-RPC 2.0 reserved codes (parse/invalid/method/internal/cancel) */
export function isProtocolError(code: number): boolean {
  return (
    code === ErrorCodes.ParseError ||
    code === ErrorCodes.InvalidRequest ||
    code === ErrorCodes.MethodNotFound ||
    code === ErrorCodes.InvalidParams ||
    code === ErrorCodes.InternalError ||
    code === ErrorCodes.RequestCancelled
  )
}

/** True for codes in Motrix's -32000..-32099 reserved range */
export function isMotrixError(code: number): boolean {
  return code <= -32000 && code >= -32099
}

export interface MdxpErrorData {
  appCode?: string
  localizedMessage?: string
  retryable?: boolean
  retryAfterSec?: number
  context?: Record<string, unknown>
}

export interface MdxpError {
  code: number
  message: string
  data?: MdxpErrorData
}

export function makeMdxpError(
  code: number,
  message: string,
  data?: MdxpErrorData
): MdxpError {
  return data === undefined ? { code, message } : { code, message, data }
}
