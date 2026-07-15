import { z } from 'zod'
import { MdxpTaskSchema } from './task.js'

const HttpHeaderSchema = z.object({ name: z.string(), value: z.string() })

/**
 * Network download schemes allowed on the public, agent-facing `download/add`
 * surface. Pinned at the contract boundary so an LLM-callable tool can never
 * be coerced into `file://` (local file read / path traversal), `javascript:`,
 * `data:`, etc. — independent of whatever the host handler does later.
 */
const SAFE_DOWNLOAD_URL = /^(https?|ftps?|sftp):\/\//i
const safeDownloadUrl = z
  .string()
  .url()
  .refine((u) => SAFE_DOWNLOAD_URL.test(u), {
    message: 'unsupported URL scheme (allowed: http, https, ftp, ftps, sftp)',
  })

/**
 * URL-shaped public "add a download" params — distinct from the browser-page
 * `download/submit`. Discriminated on `kind`; strict variants so an agent's
 * typo is loudly rejected rather than silently dropped. The host maps this onto
 * its native taskCreateRequest in Spec 4.
 */
export const DownloadAddParamsSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('url'),
    saveDir: z.string().min(1),
    uris: z.array(safeDownloadUrl).min(1),
    filename: z.string().optional(),
    headers: z.array(HttpHeaderSchema).optional(),
    connections: z.number().int().min(1).max(128).optional(),
    proxy: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('magnet'),
    saveDir: z.string().min(1),
    uri: z.string().startsWith('magnet:?'),
    selectedFiles: z.array(z.number().int().nonnegative()).optional(),
  }),
  z.strictObject({
    kind: z.literal('torrent'),
    saveDir: z.string().min(1),
    base64: z.string().min(1),
    selectedFiles: z.array(z.number().int().nonnegative()).optional(),
    displayName: z.string().optional(),
  }),
])

/** Result is the created task snapshot so callers render without polling. */
export const DownloadAddResultSchema = MdxpTaskSchema

export type DownloadAddParams = z.infer<typeof DownloadAddParamsSchema>
export type DownloadAddResult = z.infer<typeof DownloadAddResultSchema>
