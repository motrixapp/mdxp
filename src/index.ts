// MDXP — Motrix Download eXchange Protocol
// Public API surface for both Motrix desktop and the browser extension.

// vscode-jsonrpc primitives that appear in this package's public API surface,
// re-exported so consumers import them from `@motrix/mdxp` instead of reaching
// for a second package. Platform transport classes (StreamMessageReader,
// BrowserMessageReader, …) are re-exported from `./node` and `./browser`.
export type {
  Disposable,
  MessageConnection,
  MessageReader,
  MessageWriter,
} from 'vscode-jsonrpc'
export {
  CancellationToken,
  CancellationTokenSource,
  ResponseError,
} from 'vscode-jsonrpc'
export type {
  MdxpConnection,
  MdxpNotificationMap,
  MdxpRequestMap,
} from './connection.js'
export { createMdxpConnection } from './connection.js'
export type { ErrorCode, MdxpError, MdxpErrorData } from './errors.js'
export {
  ErrorCodes,
  isMotrixError,
  isProtocolError,
  makeMdxpError,
} from './errors.js'
export type { Method, Notification } from './methods.js'
export { Methods, Notifications } from './methods.js'

// Schemas (for callers that want runtime validation)
export * from './schemas/index.js'
export type { AgentTool, MdxpToolDef } from './tools.js'

// Tool registry / AI-agent tool catalog
export {
  SERVER_INITIATED_METHODS,
  Tools,
  toAgentToolCatalog,
} from './tools.js'
// Types (re-exported from schemas via types barrel)
export type * from './types.js'
