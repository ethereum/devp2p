# Ethereum Snapshot Protocol (SNAP)

The `snap` protocol runs on top of [RLPx], facilitating the exchange of Ethereum state
snapshots between peers. The protocol is an optional extension for peers supporting (or
caring about) the dynamic snapshot format.

The current version is `snap/1`.

## Overview

The `snap` protocol is designed for semi real-time data retrieval. It's goal is to make
dynamic snapshots of recent states available for peers. The `snap` protocol does not take
part in chain maintenance (block and transaction propagation); and it is **meant to be run
side-by-side with the `eth` protocol**, not standalone (e.g. chain progression is
announced via `eth`).

The protocol itself is simplistic by design (take note, the supporting implementation is
everything but simple). In its crux, `snap` supports retrieving a contiguous segment of
accounts from the Ethereum state trie, or a contiguous segment of storage slots from one
particular storage trie. Both replies are Merkle proven for immediate verification. In
addition batches of bytecodes can also be retrieved similarly to the `eth` protocol.

The synchronization mechanism the protocol enables is for peers to retrieve and verify all
the account and storage data without downloading intermediate Merkle trie nodes. The final
state trie is reassembled locally. An additional complexity nodes must be aware of, is
that state is ephemeral and moves with the chain, so syncers need to support reassembling
partially consistent state segments. This is supported by trie node retrieval similar to
`eth`, which can be used to heal trie inconsistencies (more on this later).

The `snap` protocol permits downloading the entire Ethereum state without having to
download all the intermediate Merkle proofs, which can be regenerated locally. This
reduces the networking load enormously:

- Ingress bandwidth is reduced from `O(accounts * log account + SUM(states * log states))`
  (Merkle trie nodes) to `O(accounts + SUM(states))` (actual state data).
- Egress bandwidth is reduced from `O(accounts * log account + SUM(states * log states)) *
  32 bytes` (Merkle trie node hashes) to `O(accounts + SUM(states)) / 100000 bytes`
  (number of 100KB chucks to cover the state).
- Round trip time is reduced from `O(accounts * log account + SUM(states * log states)) /
  384` (states retrieval packets) to `O(accounts + SUM(states)) / 100000 bytes` (number of
  100KB chucks to cover the state).

### Expected results

To put some numbers on the above abstract orders of magnitudes, synchronizing Ethereum
mainnet state (i.e. ignoring blocks and receipts, as those are the same) with `eth` vs.
the `snap` protocol:

Block ~#11,177,000:

- Accounts: 107,598,788 @ 19.70GiB
- Byte codes: 319,654 @ 1.48GiB
- Storage slots: 365,787,020 @ 49.88GiB
- Trie nodes: 617,045,138

|        | Time   | Upload  | Download | Packets  | Serving disk reads* |
|:------:|:------:|:-------:|:--------:|:--------:|:-------------------:|
| `eth`  | 10h50m | 20.38GB | 43.8GB   | 1607M    | 15.68TB             |
| `snap` | 2h6m   | 0.15GB  | 20.44GB  | 0.099M   | 0.096TB             |
|        | -80.6% | -99.26% | -53.33%  | -99.993% | -99.39%             |

*\*Also accounts for other peer requests during the time span.*

Post snap state heal:

- Additional trie nodes: 541,260 @ 160.44MiB
- Additional byte codes: 34 @ 234.98KiB

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

The crux of the snapshot synchronization is making contiguous ranges of accounts and
storage slots available for remote retrieval. The sort order is the same as the state trie
iteration order, which makes it possible to not only request N subsequent accounts, but
also to Merkle prove them. Some important properties of this simple algorithm:

- Opposed to *fast sync*, we only need to transfer the useful leaf data from the state
  trie and can reconstruct internal nodes locally.
- Opposed to *warp sync*, we can download small chunks of accounts and storage slots and
  immediately verify their Merkle proofs, making junk attacks impossible.
- Opposed to *warp sync*, random account ranges can be retrieved, thus synchronization
  concurrency is totally dependent on client implementation and is not forced by the
  protocol.

The gotcha of the snapshot synchronization is that serving nodes need to be able to
provide **fast** iterable access to the state of the most recent `N` (128) blocks.
Iterating the Merkle trie itself might be functional, but it's not viable (iterating the
state trie at the time of writing takes 9h 30m on an idle machine). Geth introduced
support for [dynamic snapshots], which allows iterating all the accounts in 7m
(see [blog for more]). Some important properties of the dynamic snapshots:

- Serving a contiguous range of accounts or storage slots take `O(n)` operations, and more
  importantly, it's the same for disk access too, being stored contiguously on disk (not
  counting the database read amplification).
- Maintaining a live dynamic snapshot means:
  - Opposed to *warp sync*, syncing nodes can always get the latest data, thus they don't
    need to process days' worth of blocks afterwards.
  - Opposed to *warp sync*, there is no pre-computation to generate a snapshot (it's
    updated live), so there's no periodic burden on the nodes to iterate the tries (there
    it an initial burden to create the first snapshot after sync though).
  - Providing access to 128 recent snapshots permits `O(1)` direct access to any account
    and state, which can be used during EVM execution for `SLOAD`.

The caveat of the snapshot synchronization is that as with *fast sync* (and opposed to
*warp sync*), the available data constantly moves (as new blocks arrive). The probability
of finishing sync before the 128 block window (15m) moves out is asymptotically zero. This
is not a problem, because we can self-heal. It is fine to import state snapshot chunks
from different tries, because the inconsistencies can be fixed by running a
*fast-sync-style-state-sync* on top of the assembled semi-correct state afterwards. Some
important properties of the self-healing:

- Synchronization can be aborted at any time and resumed later. It might cause
  self-healing to run longer, but it will fix the data either way.
- Synchronization on slow connections is guaranteed to finish too (as long as the node can
  download data faster than it's being produced by the network), the data cannot disappear
  from the network (opposed to warp sync).

## Data format

The accounts in the `snap` protocol are analogous to the Ethereum RLP consensus encoding
(same fields, same order), but in a **slim** format:

- The code hash is `empty list` instead of `Keccak256("")`
- The root hash is `empty list` instead of `Hash(<empty trie>)`

This is done to avoid having to transfer the same 32+32 bytes for all plain accounts over
the network.

## Protocol Messages

### GetAccountRange (0x00)

`[reqID: P, rootHash: B_32, startingHash: B_32, responseBytes: P]`

Requests an unknown number of accounts from a given account trie, starting at the
specified account hash and capped by the maximum allowed response size in bytes. The
intended purpose of this message is to fetch a large number of subsequent accounts from a
remote node and reconstruct a state subtrie locally.

- `reqID`: Request ID to match up responses with
- `rootHash`: Root hash of the account trie to serve
- `startingHash`: Account hash of the first to retrieve
- `responseBytes`: Soft limit at which to stop returning data

Notes:

- Nodes **must** always respond to the query.
- If the node does **not** have the state for the requested state root, it **must** return
  an empty reply. It is the responsibility of the caller to query an state not older than
  128 blocks.
- The responding node is allowed to return **less** data than requested (own QoS limits),
  but the node **must** return at least one account, unless no account exists in the
  requested range.
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
  a gaped reply. Such a reply would cause sync to finish early with a lot of missing data.
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

`[reqID: P, rootHash: B_32, accountHashes: [B_32], startingHash: B, responseBytes: P]`

Requests the storage slots of multiple accounts' storage tries. Since certain contracts
have huge state, the method can also request storage slots from a single account, starting
at a specific storage key hash. The intended purpose of this message is to fetch a large
number of subsequent storage slots from a remote node and reconstruct a state subtrie
locally.

- `reqID`: Request ID to match up responses with
- `rootHash`: Root hash of the account trie to serve
- `accountHashes`: Account hashes of the storage tries to serve
- `startingHash`: Storage slot hash of the first to retrieve
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

### GetTrieNodes (0x06)

`[reqID: P, rootHash: B_32, paths: [[accPath: B, slotPath1: B, slotPath2: B, ...]...], bytes: P]`

Requests a number of state (either account or storage) Merkle trie nodes **by path**. This
is analogous in functionality to the `eth/63` `GetNodeData`, but restricted to only tries
and queried by path, to break the generality that causes issues with database
optimizations.

- `reqID`: Request ID to match up responses with
- `rootHash`: Root hash of the account trie to serve
- `paths`: Trie paths to retrieve the nodes for, grouped by account
- `bytes`: Soft limit at which to stop returning data

The `paths` is one array of trie node paths to retrieve per account (i.e. list of list of
paths). Each list in the array special cases the first element as the path in the account
trie and the remaining elements as paths in the storage trie. To address an account node,
the inner list should have a length of 1 consisting of only the account path. Partial
paths (<32 bytes) should be compact encoded per the Ethereum wire protocol, full paths
should be plain binary encoded.

*This functionality was mutated into `snap` from `eth/65` to permit `eth` long term to
become a chain maintenance protocol only and move synchronization primitives out into
satellite protocols only.*

Notes:

- Nodes **must** always respond to the query.
- The returned nodes **must** be in the request order.
- If the node does **not** have the state for the requested state root or for **any**
  requested account paths, it **must** return an empty reply. It is the responsibility of
  the caller to query an state not older than 128 blocks; and the caller is expected to
  only ever query existing trie nodes.
- The responding node is allowed to return **less** data than requested (serving QoS
  limits), but the node **must** return at least one trie node.

Rationale:

- The response is capped by byte size and not by number of slots, because it makes the
  network traffic more deterministic. Although opposed to the previous request types
  (accounts, slots, codes), trie nodes are relatively deterministic (100-500B), the
  protocol remains cleaner if all packets follow the same traffic shaping rules.
- A naive way to represent trie nodes would be a simple list of `account || storage` path
  segments concatenated, but that would be very wasteful on the network as it would
  duplicate the account hash for every storage trie node.

### TrieNodes (0x07)

`[reqID: P, nodes: [node1: B, node2: B, ...]]`

Returns a number of requested state trie nodes. The order is the same as in the request,
but there might be fewer is QoS limits are reached.

## Change Log

### snap/1 (November 2020)

Version 1 was the introduction of the snapshot protocol.

[RLPx]: ../rlpx.md
[dynamic snapshots]: https://github.com/ethereum/go-ethereum/pull/20152
[blog for more]: https://blog.ethereum.org/2020/07/17/ask-about-geth-snapshot-acceleration/
