import { z } from 'zod'

export const EngineStateSchema = z.enum([
  'stopped',
  'starting',
  'ready',
  'restarting',
  'failed',
])

/** Capability-discovery info; all fields are external-safe. `features` is the
 *  raw engine feature-string list (e.g. contains 'SQLite3-Persistence'). */
export const EngineFeatureReportSchema = z.object({
  version: z.string(),
  features: z.array(z.string()),
  hasBtSeedUnverified: z.boolean(),
  hasBtSaveMetadata: z.boolean(),
  hasMoveStorage: z.boolean(),
  hasSqlitePersistence: z.boolean(),
})

export const EngineStatusParamsSchema = z.strictObject({})

export const EngineStatusResultSchema = z.object({
  state: EngineStateSchema,
  featureReport: EngineFeatureReportSchema.nullable(),
})

export type EngineState = z.infer<typeof EngineStateSchema>
export type EngineFeatureReport = z.infer<typeof EngineFeatureReportSchema>
export type EngineStatusParams = z.infer<typeof EngineStatusParamsSchema>
export type EngineStatusResult = z.infer<typeof EngineStatusResultSchema>
