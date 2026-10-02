import { DownloadHandoffPayloadSchema } from './schemas/download-handoff.js'

/**
 * Normalize schema defaults and sort object keys by UTF-16 code units, retaining
 * array order. Hash the returned string's UTF-8 bytes with SHA-256. This is an
 * MDXP encoding, not a general JSON canonicalization or authorization scheme.
 * No IO or platform crypto is needed, so both peers use the same normalization.
 */
export function canonicalDownloadHandoffPayload(input: unknown): string {
  const normalized = DownloadHandoffPayloadSchema.parse(input)
  return encode(normalized)
}

function encode(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const fields = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${fields.map(([key, item]) => `${JSON.stringify(key)}:${encode(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
