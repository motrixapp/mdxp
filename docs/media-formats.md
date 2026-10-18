# Media formats contract (MDXP 0.9.0)

`media/formats` supplies the quality picker proposed in Motrix PR #2365. It
returns video-height choices and an optional MP3 extraction choice. It does not
submit a task, prove that a download is authorized, or change pairing. The
package supplies schemas and typed RPC registration; the applications enforce
the authorization and extractor requirements below.

## Negotiation and transport

- Keep `protocolVersion` at `1.0` and all existing pairing and submit behavior.
- A host advertises `capabilities.mediaFormats: true` only when a lister is
  registered and the host implements this contract. Missing or false means the
  client MUST NOT send the request, including speculative probes.
- This method is for authenticated, ready extension sessions. It is registered
  in `Tools` with `agentFacing: false`, absent from `toAgentToolCatalog()`, and
  MUST NOT be exposed through unary `POST /mdxp`. The registry flag and a claimed
  `client.kind` are not authentication. Use the transport-verified principal.
- Capability negotiation describes support; it grants no permission to collect
  or disclose a page URL or cookies.

## Client authorization before collection and transmission

1. Start from an explicit user action requesting qualities for the current page
   or selected embedded player. Merely loading a page, observing a video,
   polling, or reconnecting MUST NOT trigger a disclosure.
2. Derive the target from the browser's current tab/document/frame identity.
   An arbitrary same-origin path is not an authenticated frame URL. Preserve
   existing build/site exclusions independently of a quality label or listing.
3. For a remote host, require the existing data-sharing grant for the exact
   selected authority and authenticated instance before sending the URL.
   Require the separate credential grant before collecting or sending cookies.
   In the extension these are `remoteDataBoundaryAcceptedAt` and
   `allowRequestCredentials`; pairing alone satisfies neither grant.
4. Capture the endpoint generation, authenticated instance, document identity,
   and relevant grants. Revalidate after asynchronous work and immediately
   before sending. Revocation, endpoint edits/switches, or document changes
   invalidate the operation; do not redirect or replay it against a new host.
5. Collect only cookies applicable to this exact browser document and its
   current cookie store/partition. Retain their scope fields. Do not read all
   browser cookies or consult another browser profile as a fallback.
6. Parse with `MediaFormatsParamsSchema` and send the parsed value, not the
   original object. The generic connection helper does not enforce these
   application-owned checks or automatically validate payloads.

Local pairing also does not authorize background cookie collection. The same
explicit-action and current-document requirements apply to local hosts.

## Request and cookie scope

The strict request is `{ url, cookies? }`. URLs are HTTP(S), at most 8,192
characters, and cannot contain user information or raw control characters. IP literals and local hostnames
remain supported; a valid scheme does not bypass the host's ordinary URL policy.
There are no raw headers, extractor flags, format selectors, or local paths.

`MediaFormatCookie` preserves the existing `Resource.Cookie` representation:
`name`, `value`, `domain`, `path`, `secure`, `httpOnly`, `sameSite`, and optional
`expiresAt`. Expiry is **Unix milliseconds**. An absent expiry denotes a session
cookie. A domain without a leading dot is host-only; a leading dot permits
domain matching under normal cookie policy. Defaults match `CookieSchema`.
DNS cookie domains may retain one trailing dot. Preserve it during validation
and matching: `media.example.` and `media.example` are separate cookie scopes.
Reject multiple trailing dots; do not remove a dot to make a cookie match.

The new method bounds fields and rejects malformed names, control characters,
cookie delimiters in values, invalid domains, and invalid paths. Its request
schema rejects cookies whose domain/path/Secure scope does not cover the
requested URL. Hosts MUST also discard expired cookies at invocation time and
apply a standard cookie policy, including domain restrictions. Schema validation
does not establish the origin of a cookie or replace browser-side authorization.

The extractor MUST preserve domain, host-only, path, Secure, and expiry rules
for **every** HTTP request, redirect, and subrequest. Browser-side SameSite and
partition restrictions must already have been respected during collection.
Do not flatten the cookies into a global `Cookie:` header: one extractor
invocation can contact multiple hosts and paths. Do not inherit browser profiles
or ambient extractor credentials/configuration. If the adapter cannot enforce
these constraints, return unavailable (for example, `credentials-unsupported`)
instead of weakening scope or silently exporting credentials another way.

Cookie values belong to the request lifetime. They MUST NOT be written to
durable storage, process arguments, logs, results, result-cache keys, or shared
caches. Use request-scoped memory/protected process I/O, cancel pending work on
revocation, and release secrets when the request ends. A credential-bearing
listing MUST NOT be shared with another principal or later request. A host may
cache credential-free results only if it rechecks current feature/site policy
before reuse and bounds cache size and lifetime.

## Results and limits

The result is one of:

```ts
{ available: true, title?: string, durationSec?: number, entries: MediaFormatEntry[] }
{ available: false, reason: string, entries: [] }
```

An available result has 1–64 entries with unique keys. Video keys are decimal
heights from `100p` through `4320p`; when present, `height` must agree with the
key. Video entries may include `fps`, `ext`, and `sizeBytes`. The audio choice is
`{ kind: 'audio', key: 'mp3', label: 'MP3' }`, with optional `ext`/`sizeBytes`.
Only offer it when the host can actually extract MP3. Labels are display text,
not selectors. The client may echo a key in `download/submit.meta.qualityLabel`,
but the submit path independently validates the URL, authorization, and choice.

`sizeBytes` is an optional estimate of the total bytes to download for this
choice, not a promise about the final encoded file size. Omit it when unknown;
do not report only the video leg of a two-stream download or label source-audio
bytes as the final MP3 size.

Unavailable results require a machine-readable reason and empty entries. Reasons
are non-exhaustive lowercase hyphenated tokens, such as `disabled`, `not-allowed`,
`binary-missing`, `unsupported`, `failed`, or `credentials-unsupported`. Do not
return stderr, credentials, host paths, or stack traces in a reason. Unknown
result fields are stripped so additive future fields do not break old clients.

`MEDIA_FORMATS_LIMITS` is exported for consumers:

| Limit | Maximum |
| --- | --- |
| Parsed params, UTF-8 JSON | 64 KiB |
| Parsed result, UTF-8 JSON | 64 KiB |
| Cookies | 256, also subject to the aggregate byte limit |
| Cookie name / value / domain / path | 256 / 4096 / 254 / 2048 characters |
| Entries / label / title | 64 / 128 / 500 characters |

Senders MUST serialize schema-parsed values and apply the aggregate byte limits
before writing to the connection. These budgets leave room for the JSON-RPC
envelope under the existing MBP1 1 MiB plaintext limit; transport limits remain
mandatory. JSON Schema discovery describes structural bounds but cannot encode
every Zod refinement (UTF-8 budgets, scope matching, key uniqueness). Consumers
must use the runtime schemas or equivalent conformance checks, not JSON Schema
alone. Hosts must bound concurrent extractor work and execution time and observe
the existing cancellation token. Unsupported/empty extractor output is an
unavailable result, never an available empty list.

## Failures and compatibility

Feature disabled, excluded site, missing executable, unsupported media, or an
ordinary extraction failure return an unavailable result. Authentication or
permission denial uses the existing `PermissionDenied`/`PairRevoked` behavior;
malformed input uses `InvalidParams`, rate admission uses `RateLimited`, and
cancellation uses `RequestCancelled`. None of these grants permission to retry
against another endpoint or to change pairing.

`MethodNotFound`/`CapabilityNotSupported` on an otherwise live, authorized
connection permits hiding the picker and falling back to existing UI. Actual
connection loss, timeout/recovery exhaustion, or revocation remains owned by
the connection state machine; do not relabel a lost connection as connected.

| Client / host | Required behavior |
| --- | --- |
| Old client / new host | Optional capability is unused; old methods work |
| New client / old host, capability absent or false | No formats request; existing UI |
| New client / host advertises support, grants valid | Explicit action may request a listing |
| Support advertised but method missing | Handle method mismatch on the still-live connection |
| Support advertised, grant absent/revoked or document changed | Do not collect/send; invalidate pending work |
| Connection lost or pairing revoked | Existing connection/revocation handling |

## Consumer acceptance and release order

Publish the reviewed protocol before changing application dependencies. No
`file:`, `link:`, local module augmentation, or mirrored wire schema may ship.
Consumers must pass these checks before advertising/calling the method:

- No request with a missing/false capability or absent remote data grant; no
  cookie lookup or cookie transmission without a credential grant.
- No automatic page-load/poll request, stale frame request, or request after
  endpoint switch, instance change, document navigation, or grant revocation.
- Cookie scope/expiry enforced across redirects; credentials absent from argv,
  logs, persistent data, and caches. Test with synthetic secrets.
- Unauthenticated, non-extension, and unary HTTP calls rejected before
  extractor work; schema-invalid and oversized payloads rejected too.
- Disabled/missing/unsupported extraction, unavailable results, cancellation,
  and new/old peer combinations follow the rules above.
- Existing pairing, submit permissions, and store/site exclusions unchanged.

Motrix PR #2365 must replace its local schemas, advertise the capability from
the registered handler, preserve cookies as scoped records, remove global cookie
headers/raw-cookie cache keys, and parse the result before returning it. Its
current empty-success case must become unavailable. Normalize extractor metadata
first: filter heights outside 100–4320, cap titles, and omit invalid fps/ext/size
fields. The existing lister accepts heights below 100 even though its submit
parser cannot select those keys. Add MP3 only when both a downloadable audio
source and conversion support exist, not merely because FFmpeg is installed.
Gate this new method on `isReady()` as well as authentication, with a rejection
test before `motrix/initialized`; do not change unrelated methods to do so.
Extension PR #56 must use
the published types, gate requests on explicit actions/support/current grants,
and retain its independent site exclusions and browser-verified frame identity.

[MIT](../LICENSE)
