# Download handoff v1

This document defines the opt-in contract added by this change. The package
provides schemas, typed RPC methods and canonical payload encoding. It does not
implement a durable ledger, browser controller or download engine. A host must
not advertise support until the persistence and fault requirements below are
implemented and tested. Existing `download/submit` behavior is unchanged.

## Negotiation and scope

An authenticated extension uses these methods only when initialize returns:

```json
{
  "capabilities": {
    "downloadHandoff": {
      "version": 1,
      "instanceId": "c2b6a2d2-430c-4bc1-bdb0-c10f35004c90",
      "maxPreparedTtlMs": 30000
    }
  }
}
```

Absence means unsupported. All four handlers and the durable activation path must
be ready before advertising this capability. These methods are extension-only:
no agent catalog or unary HTTP exposure. `agentFacing: false` is not authorization.
The transport must authenticate the principal before dispatch, independently of
caller-supplied initialize fields. No user confirmation is requested by Motrix;
the extension owns the confirmation UI and freezes its options before prepare.

V1 supports a direct HTTP(S) GET only. POST, bodies, blob URLs, media resolution,
HLS, DASH, mux and magnet are outside this handoff contract. Strict nested request
schemas reject unknown options instead of silently downgrading them to GET. A
valid URL is not permission to access it; normal host policy still applies. An
already-open browser response cannot be transferred to the engine; accepting a
Motrix handoff still needs another request and cannot guarantee one-use URLs.

## Identity and payload

Every request carries `{ instanceId, operationId }`, both UUIDs. The operation is
keyed by **durable ledger instance + authenticated principal + operationId**, not
URL, socket, tab or claimed extension ID. Separate clicks get separate operation
IDs. Reconnect/retry uses the original ID and immutable payload. Persist the key,
authenticated backend binding and confirmation state before sending mutations.
Never move a pending operation to another backend or credential identity.

`instanceId` identifies a durable ledger generation. It survives ordinary server
restarts, but MUST change if records are lost, reset or restored to an older
snapshot. Every handler compares it before any effect, returning
`HandoffInstanceChanged` (-32007) for a mismatch. The client must treat an old
pending operation as unresolved; a new instance is not evidence that the old
engine never started it. Never automatically create a replacement operation.

Prepare carries `download`: the existing submit source, metadata and optional
`saveDir`, restricted to a direct selection, without a second idempotency key.
`canonicalDownloadHandoffPayload()` parses and normalizes schema defaults, sorts
object keys by UTF-16 code units recursively, preserves array order, and encodes
with JSON string/number escaping. SHA-256 over the resulting UTF-8 bytes is the
lowercase 64-character `payloadHash`. This is an MDXP-specific encoding, not a
claim of general JSON canonicalization. Do not normalize URL queries, header
names or reorder cookies independently. Freeze timestamps and options on retry.

The host computes this hash itself, stores it with the reserved task ID, and
rejects a reused ID with different content using `HandoffPayloadConflict`
(-32008). Clients verify response key and hash against the frozen operation;
commit includes that same hash. Do not log payloads: they may contain cookies,
authorization headers or signed URLs. Hashes are correlation values, not secrets
or authorization proofs.

## Methods and results

| Method | Params | Possible result states |
| --- | --- | --- |
| `download/handoff.prepare` | key + `download` | prepared, committed, aborted, expired |
| `download/handoff.commit` | key + `payloadHash` | committed, aborted, expired, not-found |
| `download/handoff.status` | key | prepared, committed, aborted, expired, not-found |
| `download/handoff.abort` | key | aborted, committed, expired |

All results echo the key. `prepared` includes reserved `taskId`, `payloadHash`
and `expiresAt` (server Unix milliseconds). `committed` includes the same task ID
and hash. Other results contain only key and state. `committed` means durable
ownership/activation intent, not completed download; later task failures stay
with Motrix and must not cause browser replay. A removed or failed task does not
make its handoff record disappear or reusable.

Prepare performs only local validation and creates an inactive durable record.
It must not probe/fetch the source, call URL adapters, start the engine, or enqueue
active work. Resolve an omitted default directory to a concrete permitted path
and freeze it in the record, independently of the original payload hash. A later
default change must not redirect the task. Revalidate permissions and the frozen
path before commit; refusal leaves it inactive. Never silently substitute paths.
The host chooses an expiry no later than `maxPreparedTtlMs` after its current
clock. Repeating prepare does not extend that expiry or replace the task ID.

All operations on a key, including expiry, are serialized in the same durable
transaction domain. At the expiry boundary (`now >= expiresAt`), an uncommitted
record becomes expired and cannot commit. Do not evaluate deadlines only when
receiving RPC bytes; check again while holding the transaction's serialization
boundary. Crash recovery must not grant an expired record a new lifetime.

| Current state | prepare (same payload) | commit (same hash) | abort | status |
| --- | --- | --- | --- | --- |
| absent | persist prepared | not-found; no effect | persist aborted tombstone | not-found; no effect |
| prepared, not expired | unchanged prepared | persist committed + activation intent | persist aborted | prepared |
| prepared, expired | persist expired | persist expired | persist expired | persist expired |
| committed | committed | committed | committed | committed |
| aborted | aborted | aborted | aborted | aborted |
| expired | expired | expired | expired | expired |

Conflicting hashes/payloads fail before mutation when a stored hash exists,
including terminal records. A tombstone created before prepare has no payload;
any later prepare returns aborted and must not bind or start a task. Abort of an
absent operation MUST create that tombstone. A status miss is only an observation:
a delayed prepare or commit could still arrive. It is never permission to replay.

Commit atomically records the ledger transition, task and durable activation
outbox/intent before replying. A recoverable engine dispatcher must reconcile a
stable task/engine identity before retrying an activation after a crash. An
in-memory Promise cache or a database transaction around only the ledger does
not meet this contract. Do not claim exactly-once network transfer from these
requirements: the engine/source boundary and browser cancellation are separate.

Terminal records may compact to key, state, task ID and hash as applicable, but
must remain deduplicating for the lifetime of the instance. Never evict them by
URL TTL or cache pressure. To reclaim an entire generation, fence its live
sessions and rotate the instance; historical tasks may still exist and clients
must not replay old operations. Capacity exhaustion refuses new prepare/abort
mutations explicitly rather than acknowledging a tombstone that was not stored.

## Browser ownership and recovery

1. Keep the original browser request under adapter control while the extension
   collects confirmation. Choosing browser continues that original response;
   explicit cancel stops it. UI drafts expire when the adapter's hold expires;
   a UI timeout is not a promise that the browser can remain held that long.
2. Freeze the chosen options, persist the operation binding, then prepare.
   Validate the prepared reply. Do not stop the browser merely because a request
   was sent or a transport returned without a schema-valid response.
3. Stop the original browser transfer and verify the adapter's outcome, then
   persist that evidence before commit. A failed or unknown browser stop must
   not commit; attempt abort. Never replay a browser GET to hide that uncertainty.
4. Once commit might have been sent, timeout/EOF/malformed reply is unknown.
   Reconnect only to the same instance/principal and query the same operation.
   An abort result of aborted/expired is a durable fence; committed belongs to
   Motrix. A lost abort response is also unknown. `not-found` alone is not a fence.
5. Restored drafts must not re-create operations or fabricate ownership of a lost
   blocking Promise. Backend/config changes invalidate the live UI operation.
   Recovery may query or abort its original authenticated backend; it must never
   send that commit to the newly selected backend.

`$/cancelRequest` cancels RPC waiting/cooperative work; it does not create an abort
tombstone and cannot roll back a committed task. Application task cancellation is
separate. Errors, including InternalError, do not by themselves establish whether
a mutation committed. Use same-key recovery. Do not fall back to legacy
`download/submit` after a possibly transmitted handoff mutation.

## Acceptance required before host advertisement

These are integration requirements for the simulator and real host. Schema and
in-memory RPC tests in this package do not establish their persistence guarantees.
Both implementations should exercise the same scenarios with named barriers,
independently observing the ledger, engine activation and source HTTP requests.

| Fault/scenario | Required observation |
| --- | --- |
| prepare, repeat prepare | one inactive record/task ID; no source request or engine work; unchanged expiry |
| different payload or commit hash | conflict; no additional activation, including after commit |
| same URL, new operation IDs | independent records |
| different authenticated principal | no access to the other principal's record |
| abort arrives before delayed prepare/commit | durable tombstone; later messages cannot activate |
| commit wins abort race | abort returns same committed task; exactly one activation intent |
| reply lost after commit transaction | status/retry returns same task and hash; no browser replay |
| engine accepted activation, crash before acknowledgement | recover by stable identity; no second task |
| status not-found while prepare is in flight | no automatic fallback; abort fences the late prepare |
| expiry exactly at commit boundary, restart after expiry | terminal expired; no activation or TTL renewal |
| reset/restore loses ledger | new instance; old requests refused; old client outcome remains unresolved |
| disk full/transaction rollback | no success acknowledgement without durable record/outbox/tombstone |
| original browser cancellation fails or is unknown | no commit; no replacement GET |
| config/backend change or extension restart | no stale UI submission and no cross-instance replay |

Until these checks pass in the host and browser integrations, keep the capability
absent. The package contract alone does not enable or certify application support.
