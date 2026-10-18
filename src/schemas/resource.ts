import { z } from 'zod'

// Download hosts may be IP literals or local names; z.httpUrl requires a domain.
// Exported so every method that makes the HOST fetch a caller-supplied URL
// enforces the same http(s)-only policy (see `media/formats`).
export const HttpUrlSchema = z.url({
  protocol: /^https?$/,
  message: 'URL must be http: or https:',
})

export const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string().default('/'),
  secure: z.boolean().default(false),
  httpOnly: z.boolean().default(false),
  sameSite: z
    .enum(['strict', 'lax', 'none', 'unspecified'])
    .default('unspecified'),
  expiresAt: z.number().optional(),
})

export const ResourceSchema = z.object({
  url: HttpUrlSchema,
  headers: z.record(z.string(), z.string()).default({}),
  cookies: z.array(CookieSchema).default([]),
  refererPolicy: z.string().default('strict-origin-when-cross-origin'),
})

export type Resource = z.infer<typeof ResourceSchema>
export type Cookie = z.infer<typeof CookieSchema>
