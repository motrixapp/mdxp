import { z } from 'zod'

export const TaskProgressParamsSchema = z.object({
  taskId: z.string().min(1),
  bytesDone: z.number().nonnegative(),
  bytesTotal: z.number().nonnegative().nullable(),
  speedBps: z.number().nonnegative(),
  etaSec: z.number().nonnegative().nullable(),
  phase: z.enum(['queued', 'downloading', 'muxing', 'finalizing']),
})

export const TaskCompletedParamsSchema = z.object({
  taskId: z.string().min(1),
  filePath: z.string().min(1),
  durationMs: z.number().nonnegative(),
})

export const TaskErrorParamsSchema = z.object({
  taskId: z.string().min(1),
  code: z.string(),
  message: z.string(),
})

export const PairRevokedParamsSchema = z.object({
  reason: z.string(),
})

export const CancelRequestParamsSchema = z.object({
  id: z.string().min(1),
})

export type TaskProgressParams = z.infer<typeof TaskProgressParamsSchema>
export type TaskCompletedParams = z.infer<typeof TaskCompletedParamsSchema>
export type TaskErrorParams = z.infer<typeof TaskErrorParamsSchema>
export type PairRevokedParams = z.infer<typeof PairRevokedParamsSchema>
export type CancelRequestParams = z.infer<typeof CancelRequestParamsSchema>
