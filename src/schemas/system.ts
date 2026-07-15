import { z } from 'zod'

export const SystemPingParamsSchema = z.object({
  sentAt: z.number(),
})

export const SystemPingResultSchema = z.object({
  sentAt: z.number(),
  recvAt: z.number(),
})

export type SystemPingParams = z.infer<typeof SystemPingParamsSchema>
export type SystemPingResult = z.infer<typeof SystemPingResultSchema>
