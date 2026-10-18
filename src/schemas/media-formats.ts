import { z } from 'zod'
import { CookieSchema, ResourceSchema } from './resource.js'

/** Bounds apply to schema-parsed values serialized as UTF-8 JSON. */
export const MEDIA_FORMATS_LIMITS = Object.freeze({
  urlCharacters: 8192,
  cookies: 256,
  cookieNameCharacters: 256,
  cookieValueCharacters: 4096,
  cookieDomainCharacters: 254,
  cookiePathCharacters: 2048,
  paramsBytes: 64 * 1024,
  resultBytes: 64 * 1024,
  entries: 64,
  maxVideoHeight: 4320,
} as const)

// Cookie names are HTTP tokens. Values must not introduce another cookie or
// a header line; preserve the value instead of silently trimming/rewriting it.
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
// biome-ignore lint/suspicious/noControlCharactersInRegex: reject control characters at the wire boundary
const UNSAFE_COOKIE_VALUE = /[\u0000-\u001f\u007f;]/
// biome-ignore lint/suspicious/noControlCharactersInRegex: Netscape jars and HTTP headers cannot carry these controls
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

function validCookieDomain(value: string): boolean {
  const host = value.startsWith('.') ? value.slice(1) : value
  if (
    !host ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    /[\s/\\@?#;]/.test(host)
  )
    return false
  try {
    const url = new URL(`http://${host}`)
    return !url.port && url.hostname.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

/** Existing Resource cookie metadata, with bounded, header-safe fields. */
export const MediaFormatCookieSchema = CookieSchema.extend({
  name: z
    .string()
    .min(1)
    .max(MEDIA_FORMATS_LIMITS.cookieNameCharacters)
    .regex(COOKIE_NAME),
  value: z
    .string()
    .max(MEDIA_FORMATS_LIMITS.cookieValueCharacters)
    .refine(
      (value) => !UNSAFE_COOKIE_VALUE.test(value),
      'Invalid cookie value'
    ),
  domain: z
    .string()
    .min(1)
    .max(MEDIA_FORMATS_LIMITS.cookieDomainCharacters)
    .refine(validCookieDomain, 'Invalid cookie domain'),
  path: z
    .string()
    .min(1)
    .max(MEDIA_FORMATS_LIMITS.cookiePathCharacters)
    .refine(
      (value) => value.startsWith('/') && !CONTROL_CHARACTERS.test(value),
      'Invalid cookie path'
    )
    .default('/'),
  /** Unix milliseconds, matching Resource.Cookie and browser cookie capture. */
  expiresAt: z.number().int().nonnegative().optional(),
}).strict()

function coversUrl(
  cookie: z.infer<typeof MediaFormatCookieSchema>,
  url: URL
): boolean {
  const domain = cookie.domain.toLowerCase()
  const hostname = url.hostname.toLowerCase()
  const domainMatches = domain.startsWith('.')
    ? hostname === domain.slice(1) || hostname.endsWith(domain)
    : hostname === domain
  const pathMatches =
    url.pathname === cookie.path ||
    (url.pathname.startsWith(cookie.path) &&
      (cookie.path.endsWith('/') || url.pathname[cookie.path.length] === '/'))
  return (
    domainMatches &&
    pathMatches &&
    (!cookie.secure || url.protocol === 'https:')
  )
}

function checkJsonBudget(
  value: unknown,
  maximum: number,
  ctx: z.RefinementCtx
) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximum) {
    ctx.addIssue({
      code: 'custom',
      message: 'Media formats payload exceeds its byte limit',
    })
  }
}

/** Validation grants no access: the client must check its current data grants. */
export const MediaFormatsParamsSchema = z
  .object({
    url: z
      .string()
      .max(MEDIA_FORMATS_LIMITS.urlCharacters)
      .refine(
        (value) => !CONTROL_CHARACTERS.test(value),
        'Media URLs must not contain control characters'
      )
      .pipe(ResourceSchema.shape.url.max(MEDIA_FORMATS_LIMITS.urlCharacters))
      .refine((value) => {
        try {
          const url = new URL(value)
          return !url.username && !url.password
        } catch {
          return false
        }
      }, 'Media URLs must not contain user information'),
    cookies: z
      .array(MediaFormatCookieSchema)
      .max(MEDIA_FORMATS_LIMITS.cookies)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Parsing failures are already reported by the URL schema.
    let url: URL
    try {
      url = new URL(value.url)
    } catch {
      return
    }
    for (const [index, cookie] of (value.cookies ?? []).entries()) {
      if (!coversUrl(cookie, url)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cookies', index],
          message: 'Cookie scope does not cover the requested URL',
        })
      }
    }
    checkJsonBudget(value, MEDIA_FORMATS_LIMITS.paramsBytes, ctx)
  })

const VideoQualityKeySchema = z
  .string()
  .regex(/^[1-9]\d{2,3}p$/)
  .refine(
    (value) => Number.parseInt(value, 10) <= MEDIA_FORMATS_LIMITS.maxVideoHeight
  )

const entryFields = {
  label: z.string().min(1).max(128),
  ext: z
    .string()
    .regex(/^[a-zA-Z0-9]{1,16}$/)
    .optional(),
  sizeBytes: z.number().int().positive().optional(),
}

/** Tokens are picker choices, never raw extractor format selectors. */
export const MediaFormatEntrySchema = z
  .discriminatedUnion('kind', [
    z.object({
      ...entryFields,
      kind: z.literal('video'),
      key: VideoQualityKeySchema,
      height: z
        .number()
        .int()
        .min(100)
        .max(MEDIA_FORMATS_LIMITS.maxVideoHeight)
        .optional(),
      fps: z.number().positive().max(1000).optional(),
    }),
    z.object({
      ...entryFields,
      kind: z.literal('audio'),
      key: z.literal('mp3'),
    }),
  ])
  .superRefine((value, ctx) => {
    if (
      value.kind === 'video' &&
      value.height !== undefined &&
      value.key !== `${value.height}p`
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['height'],
        message: 'Height must match the quality key',
      })
    }
  })

/** Reasons are extensible machine tokens, never extractor error text. */
export const MediaFormatsUnavailableReasonSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)

/** Unknown result fields are stripped for forward compatibility. */
export const MediaFormatsResultSchema = z
  .discriminatedUnion('available', [
    z.object({
      available: z.literal(true),
      title: z.string().max(500).optional(),
      durationSec: z.number().nonnegative().optional(),
      entries: z
        .array(MediaFormatEntrySchema)
        .min(1)
        .max(MEDIA_FORMATS_LIMITS.entries),
    }),
    z.object({
      available: z.literal(false),
      reason: MediaFormatsUnavailableReasonSchema,
      entries: z.array(MediaFormatEntrySchema).length(0),
    }),
  ])
  .superRefine((value, ctx) => {
    if (
      new Set(value.entries.map((entry) => entry.key)).size !==
      value.entries.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'Quality keys must be unique',
      })
    }
    checkJsonBudget(value, MEDIA_FORMATS_LIMITS.resultBytes, ctx)
  })

export type MediaFormatCookie = z.infer<typeof MediaFormatCookieSchema>
export type MediaFormatEntry = z.infer<typeof MediaFormatEntrySchema>
export type MediaFormatsParams = z.infer<typeof MediaFormatsParamsSchema>
export type MediaFormatsResult = z.infer<typeof MediaFormatsResultSchema>
