// MDXP method names (request/response) — see docs/01-protocol-mdxp.md §6
export const Methods = Object.freeze({
  MotrixInitialize: 'motrix/initialize',
  DownloadSubmit: 'download/submit',
  DownloadCancel: 'download/cancel',
  UrlProbe: 'url/probe',
  UrlResolve: 'url/resolve',
  SystemPing: 'system/ping',
  // v1 control-plane (Spec 2)
  DownloadAdd: 'download/add',
  TaskList: 'task/list',
  TaskGet: 'task/get',
  TaskPause: 'task/pause',
  TaskResume: 'task/resume',
  TaskRemove: 'task/remove',
  StatsGet: 'stats/get',
  EngineStatus: 'engine/status',
} as const)

export type Method = (typeof Methods)[keyof typeof Methods]

// MDXP notification names — see docs/01-protocol-mdxp.md §7.
// `motrix/initialized` follows LSP convention (no $/ prefix because it's
// a one-way handshake, not a protocol meta-event).
export const Notifications = Object.freeze({
  MotrixInitialized: 'motrix/initialized',
  TaskProgress: '$/task/progress',
  TaskCompleted: '$/task/completed',
  TaskError: '$/task/error',
  PairRevoked: '$/pair/revoked',
  CancelRequest: '$/cancelRequest',
  // v1 control-plane (Spec 2): periodic aggregate stats push.
  StatsUpdate: '$/stats',
} as const)

export type Notification = (typeof Notifications)[keyof typeof Notifications]
