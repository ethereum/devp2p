# Ethereum Snapshot Protocol (SNAP)

The `snap` protocol runs on top of [RLPx], facilitating the exchange of Ethereum state snapshots between peers. The protocol is an optional extension for peers supporting (or caring about) the [dynamic flat snapshot] format.

The current version is `snap/1`.

### Overview

The `snap` protocol is designed for semi real-time data retrieval. It's goal is to make dynamic snapshots of recent states available for peers. The `snap` protocol does not take part in chain maintenance (block and transaction propagation); and it is meant to be run side-by-side with the `eth` protocol, not standalone (e.g. chain progression is announced via `eth`).

The protocol itself is simplistic by design (take note, the supporting implementation is everything but simple). It supports retrieving a contiguous segment of accounts from the Ethereum state trie, or a contiguous segment of storage slots from one particular storage trie. Both replies are Merkle proven for immediate verification.

The synchronization mechanism the protocol enables is for peers to retrieve and verify all the account and storage data without downloading intermediate Merkle trie nodes, reassembling the final state trie locally. An additional complexity nodes must be aware is that state snapshots are ephemeral and move with the chain, so syncers need to support reassembling partially consistent state segments (suggestion solution is running an `eth/63` fast sync after a successful snapshot sync to repair any trie errors).

The `snap` protocol permits downloading the entire Ethereum state without having to download all the intermediate Merkle proofs, which can be regenerated locally. This reduces the networking load enormously:

* Ingress bandwidth is reduced from `O(accounts * log account + SUM(states * log states))` (Merkle trie nodes) to `O(accounts + SUM(states))` (actual state data).
* Egress bandwidth is reduced from `O(accounts * log account + SUM(states * log states)) * 32 bytes` (Merkle trie node hashes) to `O(accounts + SUM(states)) / 100000 bytes` (number of 100KB chucks to cover the state).
* Round trip time is reduced from `O(accounts * log account + SUM(states * log states)) / 384` (states retrieval packets) to `O(accounts + SUM(states)) / 100000 bytes` (number of 100KB chucks to cover the state).

To put some numbers on the orders of magnitudes, synchronizing Ethereum mainnet state at block #X with `eth` vs the `snap` protocol:

| Metric  | `eth` | `snap` |
|:-------:|:-----:|:------:|
| Ingress |       |        |
| Egress  |       |        |
| Packets |       |        |


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

### AccountRange (0x01)

`[reqID: P, accounts: [[accHash: B_32, accData: B], ...], proof: [node_1: B, node_2, ...]]`

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

### StorageRange (0x03)

`[reqID: P, slots: [[slotHash: B_32, slotData: B], ...], proof: [node_1: B, node_2, ...]]`

## Change Log

### snap/1 ([EIP-XXXX], April 2020)

Version 1 was the introduction of the snapshot protocol.


[RLPx]: ../rlpx.md
[dynamic flat snapshot]: todo
