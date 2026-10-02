import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Run via check:package: vscode-jsonrpc exposes its browser entry only under
// the browser export condition. This checks packaging, not browser execution.
// Exercise the actual tarball, not imports from the source checkout.
const temporary = await mkdtemp(join(tmpdir(), 'mdxp-package-'))
try {
  const [packed] = JSON.parse(
    execFileSync(
      'npm',
      [
        'pack',
        '--ignore-scripts',
        '--cache',
        join(temporary, 'npm-cache'),
        '--json',
        '--pack-destination',
        temporary,
      ],
      { encoding: 'utf8' }
    )
  )
  const files = new Set(packed.files.map((file) => file.path))
  assert.ok(files.has('docs/download-handoff.md'))
  assert.ok(files.has('docs/download-handoff.zh-CN.md'))
  assert.ok(files.has('dist/schemas/download-handoff.d.ts'))
  assert.ok(![...files].some((file) => file.includes('__tests__')))
  execFileSync('tar', [
    '-xzf',
    join(temporary, packed.filename),
    '-C',
    temporary,
  ])
  const root = join(temporary, 'package')
  await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir')
  const manifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8')
  )
  for (const entry of ['.', './node', './browser']) {
    const mod = await import(
      pathToFileURL(join(root, manifest.exports[entry].import)).href
    )
    for (const name of ['Prepare', 'Commit', 'Status', 'Abort']) {
      assert.equal(
        mod.Methods[`DownloadHandoff${name}`],
        `download/handoff.${name.toLowerCase()}`
      )
      assert.equal(
        mod.Tools[mod.Methods[`DownloadHandoff${name}`]].agentFacing,
        false
      )
      assert.equal(
        typeof mod[`DownloadHandoff${name}ParamsSchema`].parse,
        'function'
      )
      assert.equal(
        typeof mod[`DownloadHandoff${name}ResultSchema`].parse,
        'function'
      )
    }
    assert.equal(typeof mod.canonicalDownloadHandoffPayload, 'function')
  }
  console.log('Verified handoff exports from all three packaged entry points')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
