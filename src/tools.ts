import { z } from 'zod'
import { type Method, Methods } from './methods.js'
import {
  DownloadCancelParamsSchema,
  DownloadCancelResultSchema,
  DownloadSubmitParamsSchema,
  DownloadSubmitResultSchema,
} from './schemas/download.js'
import {
  DownloadAddParamsSchema,
  DownloadAddResultSchema,
} from './schemas/download-add.js'
import {
  DownloadDirectoriesParamsSchema,
  DownloadDirectoriesResultSchema,
} from './schemas/download-directories.js'
import {
  EngineStatusParamsSchema,
  EngineStatusResultSchema,
} from './schemas/engine.js'
import {
  InitializeParamsSchema,
  InitializeResultSchema,
} from './schemas/initialize.js'
import { StatsGetParamsSchema, StatsResultSchema } from './schemas/stats.js'
import {
  SystemPingParamsSchema,
  SystemPingResultSchema,
} from './schemas/system.js'
import {
  OkResultSchema,
  TaskGetParamsSchema,
  TaskGetResultSchema,
  TaskListParamsSchema,
  TaskListResultSchema,
  TaskPauseParamsSchema,
  TaskRemoveParamsSchema,
  TaskResumeParamsSchema,
  TaskRevealParamsSchema,
} from './schemas/task.js'

export interface MdxpToolDef {
  readonly method: Method
  readonly description: string
  readonly paramsSchema: z.ZodType
  readonly resultSchema: z.ZodType
  /** True for methods a CLI / AI agent calls directly (vs handshake/meta). */
  readonly agentFacing: boolean
}

/**
 * Methods the SERVER initiates against the client — not agent-callable, so they
 * are absent from {@link Tools}. Colocated here so the registry's
 * "client→server only" invariant has a single source of truth (the drift test
 * derives the expected Tools key set from this).
 */
export const SERVER_INITIATED_METHODS: readonly Method[] = [
  Methods.UrlProbe,
  Methods.UrlResolve,
]

/**
 * Registry of every client→server request method, keyed by wire method name —
 * the single source of truth tying method ↔ schema ↔ description together. The
 * `agentFacing` subset is the tool catalog an AI agent sees (consumed by
 * `motrix describe` in Spec 8). The server-initiated `url/probe` + `url/resolve`
 * are intentionally absent (the server calls those on the client).
 */
export const Tools: Readonly<Record<string, MdxpToolDef>> = {
  [Methods.MotrixInitialize]: {
    method: Methods.MotrixInitialize,
    description:
      'Handshake: negotiate protocol version, identity, and capabilities.',
    paramsSchema: InitializeParamsSchema,
    resultSchema: InitializeResultSchema,
    agentFacing: false,
  },
  [Methods.SystemPing]: {
    method: Methods.SystemPing,
    description: 'Liveness probe; echoes sentAt with the server recvAt.',
    paramsSchema: SystemPingParamsSchema,
    resultSchema: SystemPingResultSchema,
    agentFacing: false,
  },
  [Methods.DownloadDirectories]: {
    method: Methods.DownloadDirectories,
    description:
      'List available default, favorite and recent directories on the Motrix host.',
    paramsSchema: DownloadDirectoriesParamsSchema,
    resultSchema: DownloadDirectoriesResultSchema,
    agentFacing: false,
  },
  [Methods.DownloadSubmit]: {
    method: Methods.DownloadSubmit,
    description:
      'Submit a browser-detected download (page-shaped; used by the extension).',
    paramsSchema: DownloadSubmitParamsSchema,
    resultSchema: DownloadSubmitResultSchema,
    agentFacing: false,
  },
  [Methods.DownloadCancel]: {
    method: Methods.DownloadCancel,
    description: 'Cancel a previously submitted download by task id.',
    paramsSchema: DownloadCancelParamsSchema,
    resultSchema: DownloadCancelResultSchema,
    agentFacing: false,
  },
  [Methods.DownloadAdd]: {
    method: Methods.DownloadAdd,
    description:
      'Add a download by URL(s), magnet, or torrent; returns the created task.',
    paramsSchema: DownloadAddParamsSchema,
    resultSchema: DownloadAddResultSchema,
    agentFacing: true,
  },
  [Methods.TaskList]: {
    method: Methods.TaskList,
    description: 'List tasks, optionally filtered by status and paginated.',
    paramsSchema: TaskListParamsSchema,
    resultSchema: TaskListResultSchema,
    agentFacing: true,
  },
  [Methods.TaskGet]: {
    method: Methods.TaskGet,
    description: 'Get a single task by id (null if not found).',
    paramsSchema: TaskGetParamsSchema,
    resultSchema: TaskGetResultSchema,
    agentFacing: true,
  },
  [Methods.TaskPause]: {
    method: Methods.TaskPause,
    description: 'Pause a task by id.',
    paramsSchema: TaskPauseParamsSchema,
    resultSchema: OkResultSchema,
    agentFacing: true,
  },
  [Methods.TaskResume]: {
    method: Methods.TaskResume,
    description: 'Resume a paused task by id.',
    paramsSchema: TaskResumeParamsSchema,
    resultSchema: OkResultSchema,
    agentFacing: true,
  },
  [Methods.TaskRemove]: {
    method: Methods.TaskRemove,
    description: 'Remove a task by id, optionally deleting its files.',
    paramsSchema: TaskRemoveParamsSchema,
    resultSchema: OkResultSchema,
    agentFacing: true,
  },
  [Methods.TaskReveal]: {
    method: Methods.TaskReveal,
    description: "Reveal a task's output in the platform file manager.",
    paramsSchema: TaskRevealParamsSchema,
    resultSchema: OkResultSchema,
    agentFacing: false,
  },
  [Methods.StatsGet]: {
    method: Methods.StatsGet,
    description: 'Get aggregate global stats (speeds + task counts).',
    paramsSchema: StatsGetParamsSchema,
    resultSchema: StatsResultSchema,
    agentFacing: true,
  },
  [Methods.EngineStatus]: {
    method: Methods.EngineStatus,
    description: 'Get the download engine lifecycle state + feature report.',
    paramsSchema: EngineStatusParamsSchema,
    resultSchema: EngineStatusResultSchema,
    agentFacing: true,
  },
}

export interface AgentTool {
  name: string
  description: string
  /** JSON Schema (draft 2020-12) emitted by `z.toJSONSchema`. */
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

/** The agent-facing tool catalog: JSON-Schema-typed tools for LLM consumption. */
export function toAgentToolCatalog(): AgentTool[] {
  return Object.values(Tools)
    .filter((tool) => tool.agentFacing)
    .map((tool) => ({
      name: tool.method,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.paramsSchema) as Record<string, unknown>,
      outputSchema: z.toJSONSchema(tool.resultSchema) as Record<
        string,
        unknown
      >,
    }))
}
