import { z } from 'zod'
import { ResourceSchema } from './resource.js'

export const SelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('direct'),
    primary: ResourceSchema,
    container: z.string().optional(),
  }),
  z.object({
    kind: z.literal('hls'),
    primary: ResourceSchema,
    container: z.enum(['mp4', 'mkv', 'ts']).default('mp4'),
  }),
  z.object({
    kind: z.literal('dash'),
    primary: ResourceSchema,
    container: z.enum(['mp4', 'mkv']).default('mp4'),
  }),
  z.object({
    kind: z.literal('mux'),
    video: ResourceSchema,
    audio: ResourceSchema,
    container: z.enum(['mp4', 'mkv']).default('mp4'),
  }),
  z.object({
    kind: z.literal('magnet'),
    uri: z.string().startsWith('magnet:?'),
  }),
])

export type Selection = z.infer<typeof SelectionSchema>
