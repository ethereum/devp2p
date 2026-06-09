# Ethereum Snapshot Protocol Version 2 (SNAP/2)

This document specifies version 2 of the `snap` protocol. It is a delta over version 1; everything not redefined here is inherited unchanged from [snap.md][snap1]. That includes the overview, the satellite relationship with `eth`, the data format, the `GetAccountRange`/`AccountRange`/`GetStorageRanges`/`StorageRanges`/`GetByteCodes`/`ByteCodes` messages (0x00–0x05), and the general framing of snap sync.

snap/2 was introduced by [EIP-8189]. It replaces snap/1's trie-node healing mechanism with state-diff application using block-level access lists ([EIP-7928]). snap/2 is meaningful only for blocks after [EIP-7928] activation, when the header field `block-access-list-hash` is present; for pre-activation blocks the snap/1 mechanism continues to apply.

## Differences from snap/1

| | snap/1 | snap/2 |
|---|---|---|
| Healing primitive | `GetTrieNodes` / `TrieNodes` (0x06 / 0x07) | `GetBlockAccessLists` / `BlockAccessLists` (0x08 / 0x09) |
| Catch-up | Iterative trie-node discovery | Sequential application of verified BALs |
| Pivot advancement during sync | Free retarget; healing reconciles afterwards | In-line BAL catch-up required before retarget |
| Reorg past current pivot | Handled by trie healing | Re-fetch of diverged leaves, gated on orphaned-BAL availability |
| Required header field | none | `block-access-list-hash` ([EIP-7928]) |

Messages 0x00–0x05 are unchanged; their definitions remain in [snap.md][snap1]. Messages 0x06 and 0x07 are removed and their IDs **must not** be reused.

## Synchronization algorithm

The high-level structure of snap sync (pivot selection, byte-bounded contiguous range download with Merkle-proven boundaries, the 128-block snapshot serving window) is unchanged; see [snap.md][snap1]. The change is the replacement of trie-node healing with BAL-based catch-up. Healing in snap/1 reacts to whatever inconsistencies the syncing node observes during trie reconstruction; snap/2's catch-up is upfront-deterministic: the set of blocks to apply is known from the header chain alone.

Concretely, the sync loop becomes:

1. Select a pivot `P` (typically `HEAD-64`).
2. Bulk-download flat state at `P` via `GetAccountRange`, `GetStorageRanges`, `GetByteCodes`.
3. As the chain advances from `P` to `P+K`, fetch BALs for `P+1..P+K` via `GetBlockAccessLists`, verify each against the `block-access-list-hash` of its header (`keccak256(rlp.encode(bal))`), and apply the resulting state diff to the partial flat state. `P+K` is then the target for any remaining range requests.
4. Repeat step 3 if the pivot advances again during catch-up.
5. Once the flat state is consistent with the latest pivot, reconstruct tries locally and verify the resulting root against the corresponding header.

There is no separate healing phase.

### Pivot advancement

In snap/1, when the pivot advances from `P` to `P+K` during state download, the syncing node retargets the new pivot and lets the healing phase reconcile the gap. snap/2 has no later healing pass, so the advance itself is the catch-up: BALs for `P+1..P+K` **must** be fetched, verified, and applied to the partially-synced flat state **before** any further range request is issued against the new pivot. Range data downloaded prior to the advance is only consistent with the new pivot once those BALs have been applied.

### Reorg past the current pivot

If the canonical chain reorgs past the current pivot `P`, the bulk-downloaded state may contain leaves written by the now-orphaned fork. Let `W` be the common ancestor of the old and new canonical chains. Recovery:

1. Fetch BALs for `W+1..P` on the orphaned fork via `GetBlockAccessLists`. Requests are keyed by block hash, so orphaned BALs are addressable identically to canonical ones, provided peers have retained them (see [Retention](#retention)).
2. From the orphaned-fork and new-fork BALs, compute the set of accounts and storage slots mutated on the orphaned fork but **not** on the new canonical fork. Entries mutated on both forks will be overwritten in step 4 and need no special handling.
3. Re-fetch the diverged entries via `GetAccountRange` and `GetStorageRanges` against a fresh pivot `P'` on the new canonical chain.
4. Apply BALs for `W+1..P'` on the new canonical fork.

If the orphaned BALs are not retained by any peer, the syncing node **must** discard partial state and restart synchronization. With the conventional pivot at `HEAD-64`, this scenario requires a reorg deeper than 64 blocks, which has not occurred on mainnet and is further bounded by PoS finality.

## Retention

Peers serving snap/2 retain BALs for both canonical and non-canonical blocks within the retention window defined in [EIP-7928] (at least the weak subjectivity period). Retention of non-canonical BALs is what enables the reorg-recovery procedure above; without it, a deep reorg forces a sync restart.

The 128-block snapshot retention for the data served by `GetAccountRange` / `GetStorageRanges` is unchanged from snap/1.

## Protocol Messages

### Unchanged from snap/1

The following messages are defined in [snap.md][snap1] and unchanged in snap/2:

- `GetAccountRange` (0x00) / `AccountRange` (0x01)
- `GetStorageRanges` (0x02) / `StorageRanges` (0x03)
- `GetByteCodes` (0x04) / `ByteCodes` (0x05)

### Removed in snap/2

- `GetTrieNodes` (0x06)
- `TrieNodes` (0x07)

These message IDs are reserved and **must not** be reused.

### GetBlockAccessLists (0x08)

`[reqID: P, hashes: [hash1: B_32, hash2: B_32, ...], bytes: P]`

Requests block access lists by block hash. The intended purpose of this message is to obtain the per-block state-diff data needed to catch up the flat state during pivot advancement and to recover from reorgs past the current pivot.

- `reqID`: Request ID to match up responses with
- `hashes`: Block hashes of the BALs to retrieve
- `bytes`: Soft limit at which to stop returning data

Notes:

- Nodes **must** always respond to the query.
- Requests are keyed by block hash, so canonical and non-canonical (orphaned) BALs are served through the same message. Serving nodes **should** retain non-canonical BALs within the retention window defined in [EIP-7928] so that syncing nodes can recover from reorgs past their pivot.
- BALs are only available for blocks after [EIP-7928] activation and within the retention window. For any requested hash outside this range, see the corresponding response semantics in [BlockAccessLists](#blockaccesslists-0x09).
- The responding node is allowed to return **less** data than requested (own QoS limits, or to honour `bytes`), truncating from the tail. The returned entries **must** preserve request order.

Rationale:

- Responses are byte-capped to keep network traffic deterministic, consistent with the other `snap` messages.
- Block hash, not block number, is the request key, because it disambiguates canonical and orphaned blocks; both are addressable through a single message without a separate fork qualifier.

### BlockAccessLists (0x09)

`[reqID: P, bals: [bal1: B, bal2: B, ...]]`

Returns the requested block access lists in request order. Each `bal_i` corresponds positionally to `hashes[i]` from the request.

- `reqID`: ID of the request this is a response for
- `bals`: List of BALs in request order

Notes:

- If a BAL is unavailable (pruned, never seen, or beyond the retention window), the response **must** contain the RLP empty string (`0x80`) at that position. Unlike `ByteCodes` (0x05), the protocol does **not** collapse unavailable entries; positional correspondence with the request is required.
- The responding node is allowed to truncate from the tail to respect the size limit. The recommended soft limit for a single response is 2 MiB.
- A received BAL is valid if and only if `keccak256(rlp.encode(bal_i))` equals the `block-access-list-hash` field of the header identified by `hashes[i]`; see [EIP-7928] for the BAL encoding.

Rationale:

- Positional empty placeholders (rather than collapsing as `ByteCodes` does) preserve the request-to-response mapping without an extra index lookup. BALs are large enough that a one-byte `0x80` placeholder is negligible overhead.
- Application order matters for correctness: BALs **must** be applied in strict block order against the correct fork, with each BAL hash verified before application. A wrong-fork or out-of-order BAL produces an invalid state root, detected at the final root check.

Caveats:

- A peer that returns a BAL whose `keccak256(rlp.encode(bal))` does not match the header commitment is misbehaving; the syncing node **should** disconnect from or deprioritize such peers.
- Peers that return empty entries for blocks that should be available may be misbehaving or may have pruned data legitimately. Implementations should track peer reliability and deprioritize unreliable peers rather than treating a single empty entry as adversarial.

## Change Log

### snap/2 ([EIP-8189])

- Added `GetBlockAccessLists` (0x08) and `BlockAccessLists` (0x09).
- Removed `GetTrieNodes` (0x06) and `TrieNodes` (0x07); IDs reserved.
- Synchronization: replaced iterative trie healing with sequential BAL application. Pivot advancement requires in-line BAL catch-up before any further range fetching against the new pivot. Reorg past the current pivot is recovered by fetching orphaned-fork BALs, re-fetching diverged leaves, and applying new-fork BALs.
- Retention: serving peers retain BALs for canonical and non-canonical blocks within the [EIP-7928] retention window.

### snap/1

See [snap.md][snap1].

[snap1]: ./snap.md
[EIP-7928]: https://eips.ethereum.org/EIPS/eip-7928
[EIP-8189]: https://eips.ethereum.org/EIPS/eip-8189
[RLPx]: ../rlpx.md
