import { z } from 'zod'

const PROTOCOL_VERSION = '1.0'

const AdapterDeclSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  urlPatterns: z.array(z.string()),
  capabilities: z.array(z.enum(['resolve', 'sniff', 'batch'])),
})

const ClientCapabilitiesSchema = z.object({
  submitDownload: z.boolean().optional(),
  resolveUrl: z.boolean().optional(),
  probeUrl: z.boolean().optional(),
  cancellation: z.boolean().optional(),
  progress: z.boolean().optional(),
})

const ExtensionClientSchema = z.object({
  kind: z.literal('extension'),
  name: z.string().min(1),
  version: z.string().min(1),
  extensionId: z.string().min(1),
  browser: z.enum(['chromium', 'firefox']),
  browserVersion: z.string().min(1),
  locale: z.string().min(1),
})

const CliClientSchema = z.object({
  kind: z.literal('cli'),
  name: z.string().min(1),
  version: z.string().min(1),
  locale: z.string().min(1).optional(),
  pid: z.number().int().optional(),
  host: z.string().optional(),
})

/**
 * Client identity, generalized to a `kind` discriminated union so non-extension
 * clients (CLI/agents) can connect. Compat shim: the shipped extension sends NO
 * `kind` field, so inject `kind: 'extension'` when absent before discriminating
 * — keeping `PROTOCOL_VERSION` '1.0' and the existing extension payload valid.
 */
const ClientSchema = z.preprocess(
  (value) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === undefined
      ? { ...(value as Record<string, unknown>), kind: 'extension' }
      : value,
  z.discriminatedUnion('kind', [ExtensionClientSchema, CliClientSchema])
)

export const InitializeParamsSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  client: ClientSchema,
  capabilities: ClientCapabilitiesSchema,
  adapters: z.array(AdapterDeclSchema),
})

const ServerAdapterSchema = z.object({
  id: z.string().min(1),
  urlPatterns: z.array(z.string()),
})

const ServerCapabilitiesSchema = z.object({
  ffmpegAvailable: z.boolean(),
  selectionKinds: z.array(z.enum(['direct', 'hls', 'dash', 'mux'])),
  progress: z.boolean(),
  cancellation: z.boolean(),
})

export const InitializeResultSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  server: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    runtime: z.enum(['electron', 'server']),
  }),
  capabilities: ServerCapabilitiesSchema,
  serverAdapters: z.array(ServerAdapterSchema),
  pairToken: z.string().optional(),
})

export type InitializeParams = z.infer<typeof InitializeParamsSchema>
export type InitializeResult = z.infer<typeof InitializeResultSchema>
