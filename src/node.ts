// Node platform entry.
//
// vscode-jsonrpc v9 split the runtime abstraction layer (RAL) out of the bare
// `vscode-jsonrpc` entry: creating/listening on a `MessageConnection` now
// requires a platform RAL to be installed first. Importing this module installs
// the Node RAL into the SAME `vscode-jsonrpc` instance that this package's
// `createMdxpConnection` resolves, so it is immune to duplicate-instance issues
// across linked workspaces.
//
// A Node host (e.g. Motrix Turbo's bridge) only needs `import '@motrix/mdxp/node'`
// once at bootstrap. The full public API is re-exported for convenience, so
// `import { createMdxpConnection } from '@motrix/mdxp/node'` also works.
import 'vscode-jsonrpc/node'

// Node transport classes, re-exported so a Node host imports its reader/writer
// from the same place as `createMdxpConnection` — no separate `vscode-jsonrpc`
// import, and guaranteed to be the instance this package installed the RAL into.
export {
  IPCMessageReader,
  IPCMessageWriter,
  PortMessageReader,
  PortMessageWriter,
  SocketMessageReader,
  SocketMessageWriter,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node'
export * from './index.js'
