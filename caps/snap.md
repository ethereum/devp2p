# Ethereum Snapshot Protocol (SNAP)

The `snap` protocol runs on top of [RLPx], facilitating the exchange of Ethereum state
snapshots between peers. The protocol is an optional extension for peers supporting (or
caring about) the dynamic snapshot format.

The current version is `snap/2`.

## Overview

The `snap` protocol is designed for semi real-time data retrieval. It's goal is to make
dynamic snapshots of recent states available for peers. The `snap` protocol does not take
part in chain maintenance (block and transaction propagation); and it is **meant to be run
side-by-side with the `eth` protocol**, not standalone (e.g. chain progression is
announced via `eth`).

The protocol itself is simplistic by design (however, the supporting implementation is
not...). At its core, `snap` supports retrieving a contiguous segment of accounts from the
Ethereum state trie, or a contiguous segment of storage slots from one particular storage
trie. Both replies are Merkle proven for immediate verification. In addition batches of
bytecodes can also be retrieved similarly to the `eth` protocol.

The synchronization mechanism the protocol enables is for peers to retrieve and verify all
the account and storage data without downloading intermediate Merkle trie nodes. The final
state trie is reassembled locally.

## Relation to `eth`

The `snap` protocol is a *dependent satellite* of `eth` (i.e. to run `snap`, you need to
run `eth` too), not a fully standalone protocol. This is a deliberate design decision:

- `snap` is meant to be a bootstrap aid for newly joining full nodes. By enforcing all
  `snap` peers to also speak `eth`, we can avoid non-full nodes from lingering attached to
  `snap` indefinitely.
- `eth` already contains well established chain and fork negotiation mechanisms, as well
  as remote peer staleness detection during sync. By running both protocols side-by-side,
  `snap` can benefit of all these mechanisms without having to duplicate them.

This *satellite* status may be changed later, but it's better to launch with a more
restricted protocol first and then expand if need be vs. trying to withdraw depended-upon
features.

The `snap` protocol is not an extension / next version of `eth` as it relies on the
availability of a *snapshot* acceleration structure that can iterate accounts and storage
slots linearly. Its purpose is also one specific sync method that might not be suitable
for all clients. Keeping `snap` as a separate protocol permits every client to decide to
pursue it or not, without hindering their capacity to participate in the `eth` protocol.

## Synchronization algorithm

The goal of the protocol is to assemble the complete state of a recent block. Since the
blockchain advances while the state is being downloaded, the sync algorithm has to
continuously re-target newer states. The current target block is called the 'pivot block'.

Synchronization uses two separate processes in parallel to achieve the target state:

- Snapshot download: ranges of state values are requested in key-order. The download
  starts at state root `R₀` of the initial pivot block and all responses are verified
  against `R₀`. As the pivot block advances, the current root is updated to `R₁`, ... `Rₙ`
  from the pivot. The state iteration does not restart when the pivot moves, i.e. it
  always advances the key until the end of state is reached. Contract storage and code is
  fetched concurrently with accounts.

  In isolation, this process would not result in a consistent state because the resulting
  state is a sequence of key-value pairs from states `R₀`, `R₁`, ... `Rₙ`. To make it
  consistent with the final root `Rₙ`, the state has to be patched using BALs:

- BAL application: synchronization continuously fetches BALs of all blocks starting at the
  initial pivot block, and applies their state diff to the state. By doing this, the final
  state is made consistent with all state modifications performed since the sync started.

Essentially, synchronization performs these steps in a loop:

1. Select a pivot `P` (typically `HEAD-64`).
2. Bulk-download flat state at `P` via `GetAccountRange`, `GetStorageRanges`, `GetByteCodes`.
3. As the chain advances from `P` to `P+K`, fetch BALs for `P+1..P+K` via
   `GetBlockAccessLists`, verify each against the `block_access_list_hash` of its header,
   and apply the resulting state diff to the partial flat state. `P+K` is then the target
   for any remaining range requests.
4. Repeat step 3 if the pivot advances again during catch-up.
5. Once the flat state is consistent with the latest pivot, reconstruct all tries locally
   and verify the resulting root against the last header.

### Reorg past the current pivot

If the canonical chain reorgs past the current pivot `P`, the bulk-downloaded state may
contain leaves written by the now-orphaned fork. Let `W` be the common ancestor of the old
and new canonical chains. Recovery:

1. Fetch BALs for `W+1..P` on the orphaned fork via `GetBlockAccessLists`. Requests are
   keyed by block hash, so orphaned BALs are addressable identically to canonical ones,
   provided peers have retained them (see [Data Retention Requirements]).
2. From the orphaned-fork and new-fork BALs, compute the set of accounts and storage slots
   mutated on the orphaned fork but **not** on the new canonical fork. Entries mutated on
   both forks will be overwritten in step 4 and need no special handling.
3. Re-fetch the diverged entries via `GetAccountRange` and `GetStorageRanges` against a
   fresh pivot `P'` on the new canonical chain.
4. Apply BALs for `W+1..P'` on the new canonical fork.

If the orphaned BALs are not retained by any peer, the syncing node **must** discard
partial state and restart synchronization. With the conventional pivot at `HEAD-64`, this
scenario requires a reorg deeper than 64 blocks, which has not occurred on mainnet and is
further bounded by PoS finality.

## Data format

The accounts in the `snap` protocol are analogous to the Ethereum RLP consensus encoding
(same fields, same order), but in a **slim** format:

- The code hash is `empty list` instead of `Keccak256("")`
- The root hash is `empty list` instead of `Hash(<empty trie>)`

This is done to avoid having to transfer the same 32+32 bytes for all plain accounts over
the network.

## Data Retention Requirements

Peers serving snap must retain BALs for both canonical and non-canonical blocks within the
retention window defined in [EIP-7928] (at least the weak subjectivity period). Retention
of non-canonical BALs is what enables the reorg-recovery procedure above; without it, a
deep reorg would force a sync restart.

Snapshot data served by `GetAccountRange`, `GetStorageRanges` must be made available for
the last 128 blocks.

## Protocol Messages

### GetAccountRange (0x00)

`[reqID: P, rootHash: B_32, startingHash: B_32, limitHash: B_32, responseBytes: P]`

Requests an unknown number of accounts from a given account trie, starting at the
specified account hash and capped by the maximum allowed response size in bytes. The
intended purpose of this message is to fetch a large number of subsequent accounts from a
remote node and reconstruct a state subtrie locally.

- `reqID`: Request ID to match up responses with
- `rootHash`: Root hash of the account trie to serve
- `startingHash`: Account hash of the first to retrieve
- `limitHash`: Account hash after which to stop serving data
- `responseBytes`: Soft limit at which to stop returning data

Notes:

- Nodes **must** always respond to the query.
- If the node does **not** have the state for the requested state root, it **must** return
  an empty reply. It is the responsibility of the caller to query an state not older than
  128 blocks.
- The responding node is allowed to return **less** data than requested (own QoS limits),
  but the node **must** return at least one account. If no accounts exist between `startingHash` and `limitHash`, then
  the first (if any) account **after** `limitHash` must be provided.
- The responding node **must** Merkle prove the starting hash (even if it does not exist)
  and the last returned account (if any exists after the starting hash).

Rationale:

- The starting account is identified deliberately by hash and not by address. As the
  accounts in the Ethereum Merkle trie are sorted by hash, the address is irrelevant. In
  addition, there is no consensus requirement for full nodes to be aware of the address
  pre-images.
- The response is capped by byte size and not by number of accounts, because it makes the
  network traffic more deterministic. As the state density is unknowable, it's also
  impossible to delimit the query with an ending hash.

Caveats:

- When requesting accounts from a starting hash, malicious nodes may skip ahead and return
  a gapped reply. Such a reply would cause sync to finish early with a lot of missing data.
  Proof of non-existence for the starting hash prevents this attack, completely covering
  the range from start to end.
- No special signaling is needed if there are no more accounts after the last returned
  one, as the attached Merkle proof for the last account will have all trie nodes right of
  the proven path zero.

### AccountRange (0x01)

`[reqID: P, accounts: [[accHash: B_32, accBody: B], ...], proof: [node_1: B, node_2, ...]]`

Returns a number of consecutive accounts and the Merkle proofs for the entire range
(boundary proofs). The left-side proof must be for the requested origin hash (even if an
associated account does not exist) and the right-side proof must be for the last returned
account.

- `reqID`: ID of the request this is a response for
- `accounts`: List of consecutive accounts from the trie
  - `accHash`: Hash of the account address (trie path)
  - `accBody`: Account body in slim format
- `proof`: List of trie nodes proving the account range

Notes:

- If the account range is the entire state (requested origin was `0x00..0` and all
  accounts fit into the response), no proofs should be sent along the response. This is
  unlikely for accounts, but since it's a common situation for storage slots, this clause
  keeps the behavior the same across both.

### GetStorageRanges (0x02)

`[reqID: P, rootHash: B_32, accountHashes: [B_32], startingHash: B, limitHash: B, responseBytes: P]`

Requests the storage slots of multiple accounts' storage tries. Since certain contracts
have huge state, the method can also request storage slots from a single account, starting
at a specific storage key hash. The intended purpose of this message is to fetch a large
number of subsequent storage slots from a remote node and reconstruct a state subtrie
locally.

- `reqID`: Request ID to match up responses with
- `rootHash`: Root hash of the account trie to serve
- `accountHashes`: Account hashes of the storage tries to serve
- `startingHash`: Storage slot hash of the first to retrieve
- `limitHash`: Storage slot hash after which to stop serving
- `responseBytes`: Soft limit at which to stop returning data

Notes:

- Nodes **must** always respond to the query.
- If the node does **not** have the state for the requested state root or for **any**
  requested account hash, it **must** return an empty reply. It is the responsibility of
  the caller to query an state not older than 128 blocks; and the caller is expected to
  only ever query existing accounts.
- The responding node is allowed to return **less** data than requested (serving QoS
  limits), but the node **must** return at least one slot, unless none exists.
- If multiple accounts' storage is requested, serving nodes should reply with the entire
  storage ranges (thus no Merkle proofs needed), up to the first contract which exceeds
  the packet limit. If the last included storage range does not fit entirely, a Merkle
  proof **must** be attached to that and **only** that.
- If a single account's storage is requested, serving nodes should only return slots
  starting with the requested starting hash, up to the last one or until the packet fills
  up. It the entire storage range is not being returned, a Merkle proof **must** be
  attached.
- If a proof is attached, the responding node **must** Merkle prove the starting hash
  (even if it does not exist) and the last returned slot (if any exists after the starting
  hash).

Rationale:

- The response is capped by byte size and not by number of slots, because it makes the
  network traffic more deterministic.
- The request supports querying multiple contracts at the same time as most storage tries
  are in the order of 100s of bytes. Querying these individually would produce a lot of
  network round trips.

Caveats:

- When requesting storage slots from a starting hash, malicious nodes may skip ahead and
  return a prefix-gapped reply. Such a reply would cause sync to finish early with a lot
  of missing data. Proof of non-existence for the starting hash prevents this attack,
  completely covering the range from start to end.
- Although serving nodes should respect the response limit requested by the caller, it is
  valuable to slightly force the limit (consider it soft only) when adding the last
  contract to avoid having to split it and prove it.
- No special signaling is needed if there are no more slots after the last returned one,
  as the attached Merkle proof for the last account will have all trie nodes right of the
  proven path zero.

### StorageRanges (0x03)

`[reqID: P, slots: [[[slotHash: B_32, slotData: B], ...], ...], proof: [node_1: B, node_2, ...]]`

Returns a number of consecutive storage slots for the requested account (i.e. list of list
of slots) and optionally the Merkle proofs for the last range (boundary proofs) if it only
partially covers the storage trie. The left-side proof must be for the requested origin
slots (even if it does not exist) and the right-side proof must be for the last returned
slots.

- `reqID`: ID of the request this is a response for
- `slots`: List of list of consecutive slots from the trie (one list per account)
  - `slotHash`: Hash of the storage slot key (trie path)
  - `slotData`: Data content of the slot
- `proof`: List of trie nodes proving the slot range

Notes:

- If the slot range is the entire storage state, no proofs will be sent along the response.

### GetByteCodes (0x04)

`[reqID: P, hashes: [hash1: B_32, hash2: B_32, ...], bytes: P]`

Requests a number of contract byte-codes by hash. This is analogous to the `eth/63`
`GetNodeData`, but restricted to only bytecode to break the generality that causes issues
with database optimizations. The intended purpose of this request is to allow retrieving
the code associated with accounts retrieved via GetAccountRange, but it's needed during
healing too.

- `reqID`: Request ID to match up responses with
- `hashes`: Code hashes to retrieve the code for
- `bytes`: Soft limit at which to stop returning data

*This functionality was duplicated into `snap` from `eth/65` to permit `eth` long term to
become a chain maintenance protocol only and move synchronization primitives out into
satellite protocols only.*

Notes:

- Nodes **must** always respond to the query.
- The returned codes **must** be in the request order.
- The responding node is allowed to return **less** data than requested (serving QoS
  limits), but the node **must** return at least one bytecode, unless none requested are
  available, in which case it **must** answer with an empty response.
- If a bytecode is unavailable, the node **must** skip that slot and proceed to the next
  one. The node **must not** return `nil` or other placeholders.

Rationale:

- The response is capped by byte size and not by number of slots, because it makes the
  network traffic more deterministic, as contract sizes can vary randomly up to 24KB with
  current consensus rules.
- By retaining the original request order and skipping unavailable bytecodes, the
  requesting node can differentiate between unavailable data (gaps in the hashes) and QoS
  limitations (missing suffix).

Caveats:

- Implementations are free to request as many or as few bytecodes in a single request, but
  they should keep in mind that requesting too few results in wasted time due to network
  latency; but requesting too many results in wasted bandwidth if the response doesn't
  fit. Average (unique) contract size on mainnet is about 5-6KB, so `bytes / 6KB` is a
  good heuristic for the number of codes to request in a single packet (e.g. for 512KB
  desired response size, 80-100 bytecodes per request is a good choice).

### ByteCodes (0x05)

`[reqID: P, codes: [code1: B, code2: B, ...]]`

Returns a number of requested contract codes. The order is the same as in the request, but
there might be gaps if not all codes are available or there might be fewer is QoS limits
are reached.

### GetBlockAccessLists (0x08)

`[reqID: P, hashes: [hash1: B_32, hash2: B_32, ...], bytes: P]`

Requests block access lists by block hash. The intended purpose of this message is to
obtain the per-block state-diff data needed to catch up the flat state during pivot
advancement and to recover from reorgs past the current pivot.

- `reqID`: Request ID to match up responses with
- `hashes`: Block hashes of the BALs to retrieve
- `bytes`: Soft limit at which to stop returning data

Notes:

- Nodes **must** always respond to the query.
- Requests are keyed by block hash, so canonical and non-canonical (orphaned) BALs are
  served through the same message. Serving nodes **should** retain non-canonical BALs
  within the retention window defined in [EIP-7928] so that syncing nodes can recover from
  reorgs past their pivot.
- BALs are only available for blocks after [EIP-7928] activation and within the retention
  window. For any requested hash outside this range, see the corresponding response
  semantics in [BlockAccessLists](#blockaccesslists-0x09).
- The responding node is allowed to return **less** data than requested (own QoS limits,
  or to honour `bytes`), truncating from the tail. The returned entries **must** preserve
  request order.

Rationale:

- Responses are byte-capped to keep network traffic deterministic, consistent with the
  other `snap` messages.
- Block hash, not block number, is the request key, because it disambiguates canonical and
  orphaned blocks; both are addressable through a single message without a separate fork
  qualifier.

### BlockAccessLists (0x09)

`[reqID: P, bals: [bal1: B, bal2: B, ...]]`

Returns the requested block access lists in request order. Each `bal_i` corresponds
positionally to `hashes[i]` from the request.

- `reqID`: ID of the request this is a response for
- `bals`: List of BALs in request order

Notes:

- If a BAL is unavailable (pruned, never seen, or beyond the retention window), the
  response **must** contain the RLP empty string (`0x80`) at that position. Unlike
  `ByteCodes` (0x05), the protocol does **not** collapse unavailable entries; positional
  correspondence with the request is required.
- The responding node is allowed to truncate from the tail to respect the size limit. The
  recommended soft limit for a single response is 2 MiB.
- Each `bal_i` is the RLP-encoded BAL. It is valid if and only if `keccak256(bal_i)`
  equals the `block_access_list_hash` field of the header identified by `hashes[i]`; see
  [EIP-7928] for the BAL encoding.

Rationale:

- Positional empty placeholders (rather than collapsing as `ByteCodes` does) preserve the
  request-to-response mapping without an extra index lookup. BALs are large enough that a
  one-byte `0x80` placeholder is negligible overhead.
- Application order matters for correctness: BALs **must** be applied in strict block
  order against the correct fork, with each BAL hash verified before application. A
  wrong-fork or out-of-order BAL produces an invalid state root, detected at the final
  root check.

Caveats:

- A peer that returns a BAL whose `keccak256(rlp.encode(bal))` does not match the header
  commitment is misbehaving; the syncing node **should** disconnect from or deprioritize
  such peers.
- Peers that return empty entries for blocks that should be available may be misbehaving
  or may have pruned data legitimately. Implementations should track peer reliability and
  deprioritize unreliable peers rather than treating a single empty entry as adversarial.

## Change Log

### snap/2 ([EIP-8189], June 2026)

- Added `GetBlockAccessLists` (0x08) and `BlockAccessLists` (0x09).
- Removed `GetTrieNodes` (0x06) and `TrieNodes` (0x07); IDs reserved.
- Synchronization: replaced iterative trie healing with BAL application.
- Retention: serving peers retain BALs for canonical and non-canonical blocks within the
  [EIP-7928] retention window.

### snap/1 (November 2020)

Version 1 was the introduction of the snapshot protocol.
Also see the [initial snap-sync announcement].

[RLPx]: ../rlpx.md
[Data Retention Requirements]: #data-retention-requirements
[initial snap-sync announcement]: https://blog.ethereum.org/2020/07/17/ask-about-geth-snapshot-acceleration/
[EIP-7928]: https://eips.ethereum.org/EIPS/eip-7928
[EIP-8189]: https://eips.ethereum.org/EIPS/eip-8189
