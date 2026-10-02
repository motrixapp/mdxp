import type {
  CancellationToken,
  MessageConnection,
  MessageReader,
  MessageWriter,
} from 'vscode-jsonrpc'
import { createMessageConnection } from 'vscode-jsonrpc'
import type {
  CancelRequestParams,
  DownloadAddParams,
  DownloadAddResult,
  DownloadCancelParams,
  DownloadCancelResult,
  DownloadDirectoriesParams,
  DownloadDirectoriesResult,
  DownloadHandoffAbortParams,
  DownloadHandoffAbortResult,
  DownloadHandoffCommitParams,
  DownloadHandoffCommitResult,
  DownloadHandoffPrepareParams,
  DownloadHandoffPrepareResult,
  DownloadHandoffStatusParams,
  DownloadHandoffStatusResult,
  DownloadSubmitParams,
  DownloadSubmitResult,
  EngineStatusParams,
  EngineStatusResult,
  InitializeParams,
  InitializeResult,
  PairRevokedParams,
  StatsGetParams,
  StatsResult,
  StatsUpdateParams,
  SystemPingParams,
  SystemPingResult,
  TaskCompletedParams,
  TaskErrorParams,
  TaskGetParams,
  TaskGetResult,
  TaskListParams,
  TaskListResult,
  TaskPauseParams,
  TaskPauseResult,
  TaskProgressParams,
  TaskRemoveParams,
  TaskRemoveResult,
  TaskResumeParams,
  TaskResumeResult,
  TaskRevealParams,
  TaskRevealResult,
  UrlProbeParams,
  UrlProbeResult,
  UrlResolveParams,
  UrlResolveResult,
} from './types.js'

// Maps method name → [params type, result type]
export interface MdxpRequestMap {
  'motrix/initialize': [InitializeParams, InitializeResult]
  'download/submit': [DownloadSubmitParams, DownloadSubmitResult]
  'download/handoff.prepare': [
    DownloadHandoffPrepareParams,
    DownloadHandoffPrepareResult,
  ]
  'download/handoff.commit': [
    DownloadHandoffCommitParams,
    DownloadHandoffCommitResult,
  ]
  'download/handoff.status': [
    DownloadHandoffStatusParams,
    DownloadHandoffStatusResult,
  ]
  'download/handoff.abort': [
    DownloadHandoffAbortParams,
    DownloadHandoffAbortResult,
  ]
  'download/directories': [DownloadDirectoriesParams, DownloadDirectoriesResult]
  'download/cancel': [DownloadCancelParams, DownloadCancelResult]
  'url/probe': [UrlProbeParams, UrlProbeResult]
  'url/resolve': [UrlResolveParams, UrlResolveResult]
  'system/ping': [SystemPingParams, SystemPingResult]
  // v1 control-plane (Spec 2)
  'download/add': [DownloadAddParams, DownloadAddResult]
  'task/list': [TaskListParams, TaskListResult]
  'task/get': [TaskGetParams, TaskGetResult]
  'task/pause': [TaskPauseParams, TaskPauseResult]
  'task/resume': [TaskResumeParams, TaskResumeResult]
  'task/remove': [TaskRemoveParams, TaskRemoveResult]
  'task/reveal': [TaskRevealParams, TaskRevealResult]
  'stats/get': [StatsGetParams, StatsResult]
  'engine/status': [EngineStatusParams, EngineStatusResult]
}

// Maps notification name → params type
export interface MdxpNotificationMap {
  'motrix/initialized': undefined
  '$/task/progress': TaskProgressParams
  '$/task/completed': TaskCompletedParams
  '$/task/error': TaskErrorParams
  '$/pair/revoked': PairRevokedParams
  '$/cancelRequest': CancelRequestParams
  '$/stats': StatsUpdateParams
}

export interface MdxpConnection {
  /** Begin processing incoming messages. Call AFTER attaching handlers. */
  listen(): void

  /**
   * Send a request. Optionally pass a `CancellationToken` so the caller can
   * abort an in-flight request — vscode-jsonrpc emits `$/cancelRequest`
   * automatically per spec §9.
   */
  sendRequest<M extends keyof MdxpRequestMap>(
    method: M,
    params: MdxpRequestMap[M][0],
    token?: CancellationToken
  ): Promise<MdxpRequestMap[M][1]>

  /**
   * Handler can accept an optional `CancellationToken`. vscode-jsonrpc wires
   * it to the underlying `$/cancelRequest` notification — the handler MUST
   * observe `token.isCancellationRequested` for cooperative cancellation.
   */
  onRequest<M extends keyof MdxpRequestMap>(
    method: M,
    handler: (
      params: MdxpRequestMap[M][0],
      token: CancellationToken
    ) => MdxpRequestMap[M][1] | Promise<MdxpRequestMap[M][1]>
  ): void

  sendNotification<N extends keyof MdxpNotificationMap>(
    name: N,
    params: MdxpNotificationMap[N]
  ): void

  onNotification<N extends keyof MdxpNotificationMap>(
    name: N,
    handler: (params: MdxpNotificationMap[N]) => void
  ): void

  dispose(): void

  /** Escape hatch: access the underlying vscode-jsonrpc connection. */
  readonly raw: MessageConnection
}

export function createMdxpConnection(
  reader: MessageReader,
  writer: MessageWriter
): MdxpConnection {
  const raw = createMessageConnection(reader, writer)

  return {
    listen: () => raw.listen(),
    // Promise<never> is assignable to all Promise<X>, satisfying the generic
    // constraint for all M simultaneously at the implementation site.
    sendRequest: (method, params, token) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (token === undefined
        ? raw.sendRequest(method as string, params)
        : raw.sendRequest(method as string, params, token)) as Promise<never>,
    onRequest: (method, handler) => {
      // vscode-jsonrpc v9 tightened GenericRequestHandler/HandlerResult, so a
      // generically-typed handler is no longer directly assignable. The runtime
      // function is correct for every M; cast the whole handler via `never`
      // (matching the `as never` escape hatches used elsewhere in this file).
      raw.onRequest(
        method as string,
        ((params: unknown, token: CancellationToken) =>
          handler(params as never, token)) as never
      )
    },
    sendNotification: (name, params) => {
      if (params === undefined) {
        raw.sendNotification(name as string)
      } else {
        raw.sendNotification(name as string, params)
      }
    },
    onNotification: (name, handler) => {
      raw.onNotification(name as string, (params: unknown) =>
        // Cast via `never`: handler accepts the concrete notification params
        // type for N, but raw.onNotification gives us `unknown`.
        handler(params as never)
      )
    },
    dispose: () => raw.dispose(),
    raw,
  }
}
