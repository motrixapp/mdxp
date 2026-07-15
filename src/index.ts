// MDXP — Motrix Download eXchange Protocol
// Public API surface for both Motrix desktop and the browser extension.

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
