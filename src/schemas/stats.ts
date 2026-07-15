import { z } from 'zod'

/**
 * Aggregate global stats — mirrors the host's domain `GlobalStats` exactly.
 * Also the payload of the `$/stats` notification.
 */
export const StatsResultSchema = z.object({
  totalDownloadSpeed: z.number(),
  totalUploadSpeed: z.number(),
  activeTasks: z.number(),
  waitingTasks: z.number(),
  stoppedTasks: z.number(),
})

export const StatsGetParamsSchema = z.strictObject({})

export type StatsResult = z.infer<typeof StatsResultSchema>
export type StatsGetParams = z.infer<typeof StatsGetParamsSchema>
/** `$/stats` notification carries the same shape as `stats/get`'s result. */
export type StatsUpdateParams = StatsResult
