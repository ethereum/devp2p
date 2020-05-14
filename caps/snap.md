# Ethereum Snapshot Protocol (SNAP)

The `snap` protocol runs on top of [RLPx](../rlpx.md), facilitating the exchange of Ethereum state snapshots between peers. The protocol is an optional extension for peers supporting (or caring about) the dynamic snapshot format.

The current version is `snap/1`.

### Overview

The `snap` protocol is designed for semi real-time data retrieval. It's goal is to make dynamic snapshots of recent states available for peers. The `snap` protocol does not take part in chain maintenance (block and transaction propagation); and it is **meant to be run side-by-side with the `eth` protocol**, not standalone (e.g. chain progression is announced via `eth`).

The protocol itself is simplistic by design (take note, the supporting implementation is everything but simple). It supports retrieving a contiguous segment of accounts from the Ethereum state trie, or a contiguous segment of storage slots from one particular storage trie. Both replies are Merkle proven for immediate verification.

The synchronization mechanism the protocol enables is for peers to retrieve and verify all the account and storage data without downloading intermediate Merkle trie nodes, reassembling the final state trie locally. An additional complexity nodes must be aware is that state snapshots are ephemeral and move with the chain, so syncers need to support reassembling partially consistent state segments (suggestion solution is running an `eth/63` fast sync after a successful snapshot sync to repair any trie errors).

The `snap` protocol permits downloading the entire Ethereum state without having to download all the intermediate Merkle proofs, which can be regenerated locally. This reduces the networking load enormously:

- Ingress bandwidth is reduced from `O(accounts * log account + SUM(states * log states))` (Merkle trie nodes) to `O(accounts + SUM(states))` (actual state data).
- Egress bandwidth is reduced from `O(accounts * log account + SUM(states * log states)) * 32 bytes` (Merkle trie node hashes) to `O(accounts + SUM(states)) / 100000 bytes` (number of 100KB chucks to cover the state).
- Round trip time is reduced from `O(accounts * log account + SUM(states * log states)) / 384` (states retrieval packets) to `O(accounts + SUM(states)) / 100000 bytes` (number of 100KB chucks to cover the state).

To put some numbers on the orders of magnitudes, synchronizing Ethereum mainnet state at block #X with `eth` vs the `snap` protocol:

| Metric  | `eth` | `snap` |
|:-------:|:-----:|:------:|
| Ingress |       |        |
| Egress  |       |        |
| Packets |       |        |

## Relation to `eth`

The `snap` protocol is a *dependent satellite* of `eth` (i.e. to run `snap`, you need to run `eth` too), not a fully standalone protocol. This is a deliberate design decision:

- `snap` is meant to be a bootstrap aid for newly joining full nodes. By enforcing all `snap` peers to also speak `eth`, we can avoid non-full nodes from lingering attached to `snap` indefinitely.
- `eth` already contains well established chain and fork negotiation mechanisms, as well as remote peer staleness detection during sync. By running both protocols side-by-side, `snap` can benefit of all these mechanisms without having to duplicate them.

The `snap` protocol is not an extension / next version of `eth` as it relies on the availability of a *snapshot* acceleration structure that can iterate accounts and storage slots linearly; and it also enables one specific sync method that might not be suitable for all clients. Keeping `snap` as a separate protocol permits every client to decide to pursue it or not, without hindering their capacity to participate in the `eth` protocol.

## Synchronization algorithm

The crux of the snapshot synchronization is making contiguous ranges of accounts and storage slots available for remote retrieval. The sort order is the same as the state trie iteration order, which makes it possible to not only request N subsequent accounts, but also to Merkle prove them. Some important properties of this simple algorithm:

- Opposed to fast sync, we only need to transfer the useful leaf data from the state trie and can reconstruct internal nodes locally.
- Opposed to warp sync, we can download small chunks of accounts and storage slots and immediately verify their Merkle proofs, making junk attacks impossible.
- Opposed to warp sync, random account ranges can be retrieves, thus synchronization concurrency is totally dependent on client implementation and is not forced by the protocol.

The gotcha of the snapshot synchronization is that serving nodes need to be able to provide **fast** iterable access to the state of the most recent N (128) blocks. Iterating the Merkle trie itself might be functional, but it's not viable (iterating the state trie takes 9h 30m). Geth introduced support for [dynamic snapshots](https://github.com/ethereum/go-ethereum/pull/20152), which allows iterating all the accounts in 7m. Some important properties of the dynamic snapshots:

- Serving a contiguous range of accounts or storage slots take O(n) operations, and more importantly, it's the same for disk access too, being stored contiguously on disk.
- Maintaining a live dynamic snapshot means:
  - Opposed to warp sync, syncing nodes can always get the latest data, thus they don't need to process days' worth of blocks afterwards.
  - Opposed to warp sync, there is no pre-computation to generate a snapshot (it's updated live), so there's no periodic burden on the nodes to iterate the tries.
  - Providing access to 128 recent snapshots permits O(1) direct access to any account and state, which can be used during EVM execution for SLOAD.

The caveat of the snapshot synchronization is that as with fast sync (and opposed to warp sync), the available data constantly moves (as new blocks arrive). The probability of finishing sync before the 128 block window (15m) moves out is asymptotically zero. This is not a problem, because we can self-heal. It is fine to import state snapshot chunks from different tries, because the inconsistencies can be fixed by running a fast-sync-state-sync on top of the assembled semi-correct state afterwards. Some important properties of the self-healing:

- Synchronization can be aborted at any time and resumed later. It might cause self-healing to run longer, but it will fix the data either way.
- Synchronization on slow connections is guaranteed to finish too, the data cannot disappear from the network (opposed to warp sync).

## Data format

The accounts in the `snap` protocol are analogous to the Ethereum RLP consensus encoding (same fields, same order), but in a **slim** format:

- The code hash is `empty list` instead of `Keccak256("")`
- The root hash is `empty list` instead of `Hash(<empty trie>)`

This is done to avoid having to transfer the same 32+32 bytes for all plain accounts over the network.

## Protocol Messages

### GetAccountRange (0x00)

`[reqID: P, rootHash: B_32, startingHash: B_32, responseBytes: P]`

Requests an unknown number of accounts from a given account trie, starting at the specified account hash and capped by the maximum allowed response size in bytes.

- `reqID`: Request ID to match up responses with
- `rootHash`: Root hash of the account trie to serve
- `startingHash`: Account hash of the first to retrieve
- `responseBytes`: Soft limit at which to stop returning data

Notes:

- Nodes **must** always respond to the query.
- If the node does **not** have the state for the requested state root, it **must** return an empty reply. It is the responsibility of the caller to query an available state.
- The responding node is allowed to return less data than requested (serving QoS limits), but the node **must** return at least one account, unless there are no more accounts in the account trie, in which case it **must** answer with an empty response.

Rationale:

- The starting account is identified deliberately by hash and not by address. As the accounts in the Ethereum Merkle trie are sorted by hash, the address is irrelevant. In addition, there is no consensus requirement for full nodes to be aware of the address pre-images.
- The response is capped by byte size and not by number of accounts, because it makes the network traffic more deterministic. As the state density is unknowable, it's also impossible to delimit the query with an ending hash.

Caveats:

- When requesting accounts from a starting hash, malicious nodes may skip ahead and return a prefix-gapped reply. Such a reply would cause sync to finish early with a lot of missing data. To counter this, requesters should always ask for a 1-2 account overlaps so malicious nodes can't skip accounts at the head of the request.

### AccountRange (0x01)

`[reqID: P, accounts: [[accHash: B_32, accBody: B], ...], proof: [node_1: B, node_2, ...]]`

Returns a number of consecutive accounts and the Merkle proofs for the entire range.

- `reqID`: ID of the request this is a response for
- `accounts`: List of consecutive accounts from the trie
  - `accHash`: Hash of the account
  - `accBody`: Account body in slim format
- `proof`: List of trie nodes proving the account range

Notes:

- If the account range is the entire state, no proofs should be sent along the response. This is unlikely for accounts, but since it's a common situation for storage slots, this clause keeps the behavior the same across both.

### GetStorageRange (0x02)

`[reqID: P, rootHash: B_32, accountHash: B_32, startingHash: B_32, responseBytes: P]`

Requests an unknown number of slots from a given account's storage trie, starting at the specified slot hash and capped by the maximum allowed response size in bytes.

- `reqID`: Request ID to match up responses with
- `rootHash`: Root hash of the account trie to serve
- `accountHash`: Account hash of the storage trie to serve
- `startingHash`: Storage slot hash of the first to retrieve
- `responseBytes`: Soft limit at which to stop returning data

Notes:

- Nodes **must** always respond to the query.
- If the node does **not** have the state for the requested state root or account, it **must** return an empty reply. It is the responsibility of the caller to query an available account.
- The responding node is allowed to return less data than requested (serving QoS limits), but the node **must** return at least one slot, unless there are no more slots in the storage trie, in which case it **must** answer with an empty response.

Rationale:

- The response is capped by byte size and not by number of slots, because it makes the network traffic more deterministic. As the state density is unknowable, it's also impossible to delimit the query with an ending hash.

Caveats:

- When requesting storage slots from a starting hash, malicious nodes may skip ahead and return a prefix-gapped reply. Such a reply would cause sync to finish early with a lot of missing data. To counter this, requesters should always ask for a 1-2 slot overlaps so malicious nodes can't skip slots at the head of the request.

### StorageRange (0x03)

`[reqID: P, slots: [[slotHash: B_32, slotData: B], ...], proof: [node_1: B, node_2, ...]]`

Returns a number of consecutive storage slots and the Merkle proofs for the entire range.

- `reqID`: ID of the request this is a response for
- `slots`: List of consecutive slots from the trie
  - `slotHash`: Hash of the storage slot
  - `slotData`: Data content of the slot
- `proof`: List of trie nodes proving the slot range

Notes:

- If the slot range is the entire storage state, no proofs should be sent along the response.

### GetByteCodes (0x04)

`[reqID: P, hashes: [hash1: B_32, hash2: B_32, ...], bytes: P]`

Requests a number of contract byte-codes by hash. This is analogous to the `eth/63` `GetNodeData`, but restricted to only bytecode to break the generality that causes issues with database optimizations.

- `reqID`: Request ID to match up responses with
- `hashes`: Code hashes to retrieve the code for
- `bytes`: Soft limit at which to stop returning data

*This functionality was duplicated into `snap` from `eth/65` to permit `eth` long term to become a chain maintenance protocol only and move synchronization primitives out into satellite protocols only.*

Notes:

- Nodes **must** always respond to the query.
- The returned codes **must** be in the request order.
- The responding node is allowed to return less data than requested (serving QoS limits), but the node **must** return at least one bytecode, unless none requested are available, in which case it **must** answer with an empty response.
- If a bytecode is unavailable, the node **must** skip that slot and proceed to the next one. The node **must not** return `nil` or other placeholders.

Rationale:

- The response is capped by byte size and not by number of slots, because it makes the network traffic more deterministic, as contract sizes can vary randomly up to 24KB with current consensus rules.
- By retaining the original request order and skipping unavailable bytecodes, the requesting node can differentiate between unavailable data (gaps in the hashes) and QoS limitations (missing suffix).

### ByteCodes (0x05)

`[reqID: P, codes: [code1: B, code2: B, ...]]`

Returns a number of requested contract codes. The order is the same as in the request, but there might be gaps if not all codes are available or there might be fewer is QoS limits are reached.

### GetTrieNodes (0x06)

`[reqID: P, hashes: [hash1: B_32, hash2: B_32, ...], bytes: P]`

Requests a number of state (either account or storage) Merkle trie nodes by hash. This is analogous to the `eth/63` `GetNodeData`, but restricted to only tries to break the generality that causes issues with database optimizations.

- `reqID`: Request ID to match up responses with
- `hashes`: Trie node hashes to retrieve the nodes for
- `bytes`: Soft limit at which to stop returning data

*This functionality was duplicated into `snap` from `eth/65` to permit `eth` long term to become a chain maintenance protocol only and move synchronization primitives out into satellite protocols only.*

Notes:

- Nodes **must** always respond to the query.
- The returned nodes **must** be in the request order.
- The responding node is allowed to return less data than requested (serving QoS limits), but the node **must** return at least one trie node, unless none requested are available, in which case it **must** answer with an empty response.
- If a trie node is unavailable, the node **must** skip that slot and proceed to the next one. The node **must not** return `nil` or other placeholders.

Rationale:

- The response is capped by byte size and not by number of slots, because it makes the network traffic more deterministic. Although opposed to the previous request types (accounts, slots, codes), trie nodes are relatively deterministic (100-500B), the protocol remains cleaner if all packets follow the same traffic shaping rules.
- By retaining the original request order and skipping unavailable trie nodes, the requesting node can differentiate between unavailable data (gaps in the hashes) and QoS limitations (missing suffix).

### TrieNodes (0x07)

`[reqID: P, nodes: [node1: B, node2: B, ...]]`

Returns a number of requested state trie nodes. The order is the same as in the request, but there might be gaps if not all codes are available or there might be fewer is QoS limits are reached.

## Change Log

### snap/1 ([EIP-XXXX](https://eips.ethereum.org/EIPS/eip-XXXX), April 2020)

Version 1 was the introduction of the snapshot protocol.
