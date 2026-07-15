import { z } from 'zod'
import { ResourceSchema } from './resource.js'

// url/probe ----------------------------------------------------

export const UrlProbeParamsSchema = z.object({
  url: z.string().url(),
  hint: z.object({ siteName: z.string().optional() }).optional(),
})

export const UrlProbeResultSchema = z.object({
  handled: z.boolean(),
  adapterId: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
})

// url/resolve --------------------------------------------------

const QualityEnum = z.enum(['360p', '720p', '1080p', '1440p', '2160p', 'best'])

const ResolvedSelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('direct'),
    primary: ResourceSchema,
    container: z.string().optional(),
    quality: z.string(),
    sizeBytes: z.number().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('hls'),
    primary: ResourceSchema,
    container: z.string(),
    quality: z.string(),
  }),
  z.object({
    kind: z.literal('mux'),
    video: ResourceSchema,
    audio: ResourceSchema,
    container: z.string(),
    quality: z.string(),
    sizeBytes: z.number().nonnegative().optional(),
  }),
])

const SubtitleSchema = z.object({
  languageCode: z.string(),
  languageName: z.string(),
  url: z.string().url(),
  format: z.enum(['vtt', 'srt', 'ttml']),
})

export const UrlResolveParamsSchema = z.object({
  url: z.string().url(),
  preferences: z
    .object({
      maxQuality: QualityEnum.optional(),
      preferContainer: z.enum(['mp4', 'mkv', 'webm']).optional(),
      includeAudio: z.boolean().optional(),
      includeSubtitles: z.boolean().optional(),
    })
    .optional(),
})

export const UrlResolveResultSchema = z.object({
  selections: z.array(ResolvedSelectionSchema),
  meta: z.object({
    title: z.string(),
    author: z.string().optional(),
    durationSec: z.number().nonnegative().optional(),
    thumbnail: z.string().url().optional(),
    description: z.string().optional(),
    publishedAt: z.number().optional(),
    tags: z.array(z.string()).optional(),
  }),
  subtitles: z.array(SubtitleSchema).optional(),
  extractedBy: z.object({
    adapterId: z.string(),
    adapterVersion: z.string(),
    extractedAt: z.number(),
  }),
})

export type UrlProbeParams = z.infer<typeof UrlProbeParamsSchema>
export type UrlProbeResult = z.infer<typeof UrlProbeResultSchema>
export type UrlResolveParams = z.infer<typeof UrlResolveParamsSchema>
export type UrlResolveResult = z.infer<typeof UrlResolveResultSchema>
