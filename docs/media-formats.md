# Media formats v1

This document defines the `media/formats` contract added by this change. The
package provides the wire schemas, the typed RPC entry and the tool registry
entry. It does not implement media-site policy, an extractor, a picker or a
cache. A host must not advertise support until the requirements below are
implemented and tested. Existing `download/submit` behavior is unchanged.

## Negotiation and scope

An authenticated extension may call `media/formats` only when initialize
returns `capabilities.mediaFormats === true`. Absence means unsupported, and a
host that has not registered a lister must not advertise it.

The method lists the downloadable qualities a page offers so a picker can show
real options before the user submits. It does not transfer a download and it
does not authorize one: the later `download/submit` is validated on its own,
including its `meta.qualityLabel`. Listing a page is a HOST-side fetch — the
host runs its own extractor on a caller-supplied URL.

`media/formats` is extension-only. It is registered in `Tools` for schema
discovery with `agentFacing: false`, must not appear in the agent tool catalog,
and must not be reachable over the unary HTTP transport. `agentFacing: false`
is not authorization: the transport must authenticate the principal as a paired
extension session before dispatch, independently of any caller-supplied
initialize fields.

## Data sharing

- Only `http:`/`https:` URLs are accepted. `file:`, `data:` and `javascript:`
  are rejected at the contract boundary. A valid URL is not permission to
  access it — the host's normal media-site, permission, size and rate policy
  still applies, and a URL the submit path would refuse must also be refused
  here so the picker can never promise a quality the submit would decline.
- Browser-session cookies are optional and are disclosed to the extractor for
  that one URL only. They are never persisted, never returned in the result and
  never logged. Only the `{ name, value }` pair needed for a `Cookie:` header
  crosses the wire; domain, expiry and other browser data stay in the browser.
  The list is bounded to 256 pairs, and each name/value pair is bounded, so a
  client cannot force unbounded header growth.
- The result carries a title, a duration and the option list. It must not carry
  extractor stderr, filesystem paths, or any other host detail that was not
  requested.

## Methods and results

Params are strict: unknown keys are rejected instead of silently ignored.

```ts
{ url: string /* http(s) */, cookies?: { name: string; value: string }[] }
```

The result is non-strict so a newer host may add fields an older client
ignores:

```ts
{
  available: boolean
  reason?: string   // machine-readable, opaque, non-exhaustive
  title?: string
  durationSec?: number
  entries: Array<{
    key: string // /^(\d{3,4}p|mp3)$/
    kind: 'video' | 'audio'
    label: string
    height?: number
    fps?: number
    ext?: string
    sizeBytes?: number
  }>
}
```

`key` is the quality token the client echoes back as
`download/submit.meta.qualityLabel` — never a raw extractor selector, so a
client cannot smuggle arbitrary format syntax into a download. `entries` is
empty when `available` is false.

## Failure semantics

A listing that cannot be produced is a SUCCESSFUL result with
`available: false`, a machine-readable `reason` (`disabled`, `not-allowed`,
`binary-missing`, `unsupported`, `failed`, …) and empty `entries`. `reason` is
opaque and its set is not exhaustive: clients must not branch on an exhaustive
list, and must render an unavailable picker rather than an error. Transport and
protocol errors (including `MethodNotFound` from a host that predates this
method) are the only failures; a client that receives one must treat the
desktop as connected-but-unsupported, not as absent.

## Compatibility and release order

Neither side may require synchronized installation. Keep `protocolVersion`
`1.0` and the existing initialize, submit, task and pairing contracts.

| Extension | Motrix | Result |
| --- | --- | --- |
| Existing | Existing | No calls; unchanged |
| New | Existing (no capability, no method) | `MethodNotFound`; keep the legacy picker/no-op path |
| Existing | New (capability absent from the client's point of view) | Capability simply unused |
| New | New, capability `true` | Formats listed |

A host must keep the capability absent until it also enforces the URL scheme
restriction and the cookie bound above — advertising the capability is a claim
that the constraints in this document are enforced, not just that the lister
exists.

## Acceptance required before host advertisement

1. The lister is registered only for authenticated, paired extension sessions,
   and is not exposed on the unary HTTP transport or in the agent catalog.
2. Params are validated with the exported schema, so a non-http(s) URL or an
   over-long cookie list is rejected before any process is spawned.
3. Refusals (feature disabled, host not allowlisted, extractor missing, extractor
   error) all return `available: false` with a reason, never a crash and never a
   protocol error, and never a partial option list the submit would reject.
4. Cookies are used for the single extractor invocation and are not persisted or
   logged.

## License

[MIT](../LICENSE)
