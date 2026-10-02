import { z } from 'zod'
import { DownloadSubmitParamsSchema } from './download.js'
import { CookieSchema, ResourceSchema } from './resource.js'
import { SelectionSchema } from './selection.js'

/** Optional capability. Absence means the server cannot perform handoff v1. */
export const DownloadHandoffCapabilitySchema = z.object({
  version: z.literal(1),
  /** Stable across restart; MUST rotate if the durable ledger is lost/reset. */
  instanceId: z.uuid(),
  maxPreparedTtlMs: z.number().int().min(1).max(120_000),
})

/** Identity is supplied by the authenticated transport, never these params. */
export const DownloadHandoffKeySchema = z
  .object({
    instanceId: z.uuid(),
    operationId: z.uuid(),
  })
  .strict()

// V1 only prepares direct HTTP(S) GET downloads. Strict objects prevent a
// caller's POST/body/options from being silently stripped into a GET request.
export const DownloadHandoffPayloadSchema = DownloadSubmitParamsSchema.omit({
  idempotencyKey: true,
})
  .extend({
    source: DownloadSubmitParamsSchema.shape.source.strict(),
    meta: DownloadSubmitParamsSchema.shape.meta.strict(),
    selection: SelectionSchema.options[0]
      .extend({
        primary: ResourceSchema.extend({
          cookies: z.array(CookieSchema.strict()).default([]),
        }).strict(),
      })
      .strict(),
  })
  .strict()

export const DownloadHandoffPrepareParamsSchema =
  DownloadHandoffKeySchema.extend({
    download: DownloadHandoffPayloadSchema,
  }).strict()
export const DownloadHandoffCommitParamsSchema =
  DownloadHandoffKeySchema.extend({
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()
export const DownloadHandoffStatusParamsSchema = DownloadHandoffKeySchema
export const DownloadHandoffAbortParamsSchema = DownloadHandoffKeySchema

const task = {
  taskId: z.string().min(1).max(128),
  /** SHA-256 of canonicalDownloadHandoffPayload(download), encoded as UTF-8. */
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
}
const prepared = DownloadHandoffKeySchema.extend({
  state: z.literal('prepared'),
  ...task,
  /** Server Unix milliseconds; expiry is checked inside the ledger transaction. */
  expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict()
const committed = DownloadHandoffKeySchema.extend({
  state: z.literal('committed'),
  ...task,
}).strict()
const aborted = DownloadHandoffKeySchema.extend({
  state: z.literal('aborted'),
}).strict()
const expired = DownloadHandoffKeySchema.extend({
  state: z.literal('expired'),
}).strict()
const notFound = DownloadHandoffKeySchema.extend({
  /** Observation only: a prepare/commit may still be in flight. */
  state: z.literal('not-found'),
}).strict()

export const DownloadHandoffPrepareResultSchema = z.discriminatedUnion(
  'state',
  [prepared, committed, aborted, expired]
)
export const DownloadHandoffStatusResultSchema = z.discriminatedUnion('state', [
  prepared,
  committed,
  aborted,
  expired,
  notFound,
])
/** A successful commit response never leaves the operation merely prepared. */
export const DownloadHandoffCommitResultSchema = z.discriminatedUnion('state', [
  committed,
  aborted,
  expired,
  notFound,
])
/** Aborting an absent operation creates a tombstone; it never returns not-found. */
export const DownloadHandoffAbortResultSchema = z.discriminatedUnion('state', [
  aborted,
  committed,
  expired,
])

export type DownloadHandoffCapability = z.infer<
  typeof DownloadHandoffCapabilitySchema
>
export type DownloadHandoffKey = z.infer<typeof DownloadHandoffKeySchema>
export type DownloadHandoffPayload = z.infer<
  typeof DownloadHandoffPayloadSchema
>
export type DownloadHandoffPrepareParams = z.infer<
  typeof DownloadHandoffPrepareParamsSchema
>
export type DownloadHandoffPrepareResult = z.infer<
  typeof DownloadHandoffPrepareResultSchema
>
export type DownloadHandoffCommitParams = z.infer<
  typeof DownloadHandoffCommitParamsSchema
>
export type DownloadHandoffCommitResult = z.infer<
  typeof DownloadHandoffCommitResultSchema
>
export type DownloadHandoffStatusParams = z.infer<
  typeof DownloadHandoffStatusParamsSchema
>
export type DownloadHandoffStatusResult = z.infer<
  typeof DownloadHandoffStatusResultSchema
>
export type DownloadHandoffAbortParams = z.infer<
  typeof DownloadHandoffAbortParamsSchema
>
export type DownloadHandoffAbortResult = z.infer<
  typeof DownloadHandoffAbortResultSchema
>
