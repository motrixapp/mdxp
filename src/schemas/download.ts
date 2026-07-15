import { z } from 'zod'
import { SelectionSchema } from './selection.js'

export const DownloadSubmitParamsSchema = z.object({
  source: z.object({
    pageUrl: z.string().url(),
    pageTitle: z.string().max(500),
    detectedAt: z.number(),
    siteHint: z.string().max(64).optional(),
  }),
  selection: SelectionSchema,
  meta: z.object({
    suggestedFilename: z.string().max(255),
    qualityLabel: z.string().max(64),
    estimatedBytes: z.number().nonnegative().optional(),
    durationSec: z.number().nonnegative().optional(),
  }),
  /**
   * Client-generated key identifying ONE logical submit. Motrix dedups on
   * (session, key): a retransmit of the same submission — lost response,
   * reconnect replay — returns the original task instead of creating a
   * duplicate. Optional for backward compatibility.
   */
  idempotencyKey: z.string().min(8).max(128).optional(),
})

export const DownloadSubmitResultSchema = z.object({
  taskId: z.string().min(1),
})

export const DownloadCancelParamsSchema = z.object({
  taskId: z.string().min(1),
})

export const DownloadCancelResultSchema = z.object({
  ok: z.literal(true),
})

export type DownloadSubmitParams = z.infer<typeof DownloadSubmitParamsSchema>
export type DownloadSubmitResult = z.infer<typeof DownloadSubmitResultSchema>
export type DownloadCancelParams = z.infer<typeof DownloadCancelParamsSchema>
export type DownloadCancelResult = z.infer<typeof DownloadCancelResultSchema>
