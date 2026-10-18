import { z } from 'zod'
import { HttpUrlSchema } from './resource.js'

// media/formats ------------------------------------------------

/**
 * A cookie captured from the CALLER's browser session and forwarded verbatim
 * to the extractor, exactly like `download/submit`'s resource cookies. Only
 * the pair needed for a `Cookie:` header is disclosed — domain/expiry metadata
 * stays in the browser.
 */
export const MediaFormatCookieSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().max(4096),
})

export const MediaFormatsParamsSchema = z
  .object({
    /**
     * Page (watch page or direct media) URL whose formats should be listed.
     * http(s) only: the host fetches this URL with its own extractor, so
     * local/`file:`/`data:` schemes are rejected at the boundary.
     */
    url: HttpUrlSchema,
    /**
     * Browser-session cookies for member-only media. Optional; the host only
     * forwards them to the extractor for this URL and never persists or
     * returns them. Bounded so a client cannot force unbounded header growth.
     */
    cookies: z.array(MediaFormatCookieSchema).max(256).optional(),
  })
  .strict()

/**
 * One selectable option. `key` is the quality token the client echoes back as
 * `download/submit.meta.qualityLabel` — never a raw extractor selector, so a
 * client cannot smuggle arbitrary format syntax through this schema.
 */
export const MediaFormatEntrySchema = z.object({
  key: z.string().regex(/^(\d{3,4}p|mp3)$/),
  kind: z.enum(['video', 'audio']),
  /** Display label, e.g. `1080p` or `MP3`. */
  label: z.string().min(1).max(64),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  ext: z.string().min(1).max(16).optional(),
  sizeBytes: z.number().int().positive().optional(),
})

/**
 * Non-strict result: a newer host may add fields (forward-compatible), and an
 * unavailable listing is expressed as `available: false` + `reason` with an
 * empty `entries` — never as a protocol error. `reason` is an opaque
 * machine-readable token (`disabled`, `not-allowed`, `unsupported`, `failed`,
 * …); clients must not branch on an exhaustive list.
 */
export const MediaFormatsResultSchema = z.object({
  available: z.boolean(),
  reason: z.string().min(1).max(64).optional(),
  title: z.string().max(500).optional(),
  durationSec: z.number().nonnegative().optional(),
  entries: z.array(MediaFormatEntrySchema),
})

export type MediaFormatCookie = z.infer<typeof MediaFormatCookieSchema>
export type MediaFormatEntry = z.infer<typeof MediaFormatEntrySchema>
export type MediaFormatsParams = z.infer<typeof MediaFormatsParamsSchema>
export type MediaFormatsResult = z.infer<typeof MediaFormatsResultSchema>
