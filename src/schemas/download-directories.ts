import { z } from 'zod'

/** Native paths belong to the target Motrix host, never the browser machine. */
export const DownloadDirectoryPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) => !value.includes('\0'),
    'Directory paths must not contain NUL'
  )

export const DownloadDirectoriesParamsSchema = z.object({}).strict()
export const DownloadDirectoriesResultSchema = z.object({
  /** Null when the configured default is currently unavailable. */
  defaultSaveDir: DownloadDirectoryPathSchema.nullable(),
  favorites: z.array(DownloadDirectoryPathSchema).max(20),
  recent: z.array(DownloadDirectoryPathSchema).max(10),
})

export type DownloadDirectoriesParams = z.infer<
  typeof DownloadDirectoriesParamsSchema
>
export type DownloadDirectoriesResult = z.infer<
  typeof DownloadDirectoriesResultSchema
>
