import { z } from 'zod'

/**
 * Control-plane task status. Richer than the lossy 4-value
 * `$/task/progress.phase`; snake_case-aligned with the host's domain
 * `TaskStatus` so the host-side mapper is near-identity. `metadata_ready` maps
 * to `queued` and `removed` is filtered out of `task/list` (not a value here).
 */
export const MdxpTaskStatusSchema = z.enum([
  'queued',
  'fetching_metadata',
  'downloading',
  'paused',
  'seeding',
  'finalizing',
  'completed',
  'error',
])

export const MdxpTaskTypeSchema = z.enum([
  'http',
  'ftp',
  'bt',
  'magnet',
  'metalink',
])

/** BitTorrent-only public subset (omits swarm/announce/piece internals). */
export const MdxpBtSchema = z.object({
  peers: z.number(),
  seeds: z.number(),
  ratio: z.number(),
  trackers: z.array(z.string()),
})

/**
 * First-class public task DTO — a deliberate NARROW projection of the host's
 * ~40-field domain `DownloadTask`. Result/notification payload, so non-strict
 * (a newer server may add fields older clients ignore). The public id is `id`,
 * never the volatile engine gid.
 */
export const MdxpTaskSchema = z.object({
  id: z.string(),
  type: MdxpTaskTypeSchema,
  name: z.string(),
  status: MdxpTaskStatusSchema,
  /** Fraction in [0,1] — identity with the domain (DownloadTask.progress is
   *  already completed/total). `finalPath`, by contrast, is a conditional
   *  projection (non-null only once completed), not a blind copy. */
  progress: z.number(),
  bytesDone: z.number(),
  bytesTotal: z.number().nullable(),
  speedBps: z.number(),
  etaSec: z.number().nullable(),
  saveDir: z.string(),
  error: z.string().nullable(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
  finalPath: z.string().nullable(),
  infoHash: z.string().nullable().optional(),
  bt: MdxpBtSchema.optional(),
  /** Open set of `DL_*` values (host's `DownloadErrorCode`); the host may add
   *  new codes over time, so consumers MUST tolerate an unrecognized string
   *  here rather than reject it — adding a value is not a breaking change. */
  errorCode: z.string().nullish(),
})

/** Shared result for write methods that only need to ack. */
export const OkResultSchema = z.object({ ok: z.literal(true) })

// ─── task/list ────────────────────────────────────────────────
export const TaskListParamsSchema = z.strictObject({
  status: MdxpTaskStatusSchema.optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
})
export const TaskListResultSchema = z.object({
  tasks: z.array(MdxpTaskSchema),
  total: z.number(),
})

// ─── task/get ─────────────────────────────────────────────────
export const TaskGetParamsSchema = z.strictObject({
  taskId: z.string().min(1),
})
export const TaskGetResultSchema = z.object({
  task: MdxpTaskSchema.nullable(),
})

// ─── task/pause · task/resume ─────────────────────────────────
export const TaskPauseParamsSchema = z.strictObject({
  taskId: z.string().min(1),
})
export const TaskResumeParamsSchema = z.strictObject({
  taskId: z.string().min(1),
})

// ─── task/remove ──────────────────────────────────────────────
export const TaskRemoveParamsSchema = z.strictObject({
  taskId: z.string().min(1),
  deleteFiles: z.boolean().optional(),
})

export type MdxpTaskStatus = z.infer<typeof MdxpTaskStatusSchema>
export type MdxpTaskType = z.infer<typeof MdxpTaskTypeSchema>
export type MdxpTask = z.infer<typeof MdxpTaskSchema>
export type OkResult = z.infer<typeof OkResultSchema>
export type TaskListParams = z.infer<typeof TaskListParamsSchema>
export type TaskListResult = z.infer<typeof TaskListResultSchema>
export type TaskGetParams = z.infer<typeof TaskGetParamsSchema>
export type TaskGetResult = z.infer<typeof TaskGetResultSchema>
export type TaskPauseParams = z.infer<typeof TaskPauseParamsSchema>
export type TaskPauseResult = OkResult
export type TaskResumeParams = z.infer<typeof TaskResumeParamsSchema>
export type TaskResumeResult = OkResult
export type TaskRemoveParams = z.infer<typeof TaskRemoveParamsSchema>
export type TaskRemoveResult = OkResult
