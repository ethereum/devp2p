# Ethereum Witness Protocol (wit)

The `wit` protocol runs on top of [RLPx], facilitating the exchange of Ethereum state
witnesses between peers. The protocol is an optional extension for peers supporting (or
caring about) the state witnesses for Ethereum blocks.

The current version is `wit/0`.

### Overview

The `wit` protocol is designed to assist clients in syncing up to the tip of the chain.
Eventually, it also aspires to assist in stateless client operation. The `wit` protocol
does not take part in chain maintenance (block and transaction propagation); and it is
**meant to be run side-by-side with the `eth` protocol**, not standalone (e.g. chain
progression is announced via `eth`). (like the `snap` protocol)

Despite the name, version 0 will not provide actual witnesses. It will provide meta-data
about the witness, which can be used to download the witness over the `eth` protocol.

For now, the known use case is to assist [Beam Syncing] peers. By requesting witness
metadata, these peers will keep up with the tip of the network and become fully-synced
nodes faster.

Using the `wit` protocol, peers ask each other for the list of trie node hashes read
during the execution of a particular block. This includes the following data:

- Storage nodes
- Bytecodes
- Account nodes
  - Read during EVM execution
  - Read during transaction validation
  - Read during block reward calculation
- Nodes read when generating the final state root (i.e. sometimes deleting data requires a
  trie refactor that reads nearby trie nodes)

The trie node hashes which are generated at the end of the block from existing data are
*not* included. For example, the final state root hash is not included.

## Relation to `eth`

The `wit` protocol follows the same pattern as `snap`. It is a *dependent satellite* of
`eth` (i.e. to run `wit`, you need to run `eth` too), not a fully standalone protocol.
This is a deliberate design decision:

- `wit` is meant to be a bootstrap aid for newly joining full nodes. By enforcing all
  `wit` peers to also speak `eth`, we can avoid non-full nodes from lingering attached to
  `wit` indefinitely.
- `eth` already contains well established chain and fork negotiation mechanisms, as well
  as remote peer staleness detection during sync. By running both protocols side-by-side,
  `wit` can benefit of all these mechanisms without having to duplicate them.

This *satellite* status may be changed later, but it's better to launch with a more
restricted protocol first and then expand if need be vs. trying to withdraw depended-upon
features.

In order to follow the `wit` protocol, clients must generate witness metadata when
executing blocks. For now, its primary purpose is also one specific sync method that might
not be suitable for all clients. Keeping `wit` as a separate protocol permits every client
to decide to pursue it or not, without hindering their capacity to participate in the
`eth` protocol.

## Accelerating Beam Sync

At its most naive, Beam Sync needs to download any missing state one trie node at a time.
According to a recent test, after Beam Syncing for 22 hours, the median block still
required more than 300 new trie nodes. At an optimistic 100ms round-trip time, that means
30 seconds per block of data download. This is where witness metadata can help
tremendously.

If a client can request the trie node hashes used by a block up front, those 300 trie
nodes can likely be accessed in a fraction of a second. That's easily enough to keep
synced with mainnet.

Unfortunately, the list of trie node hashes cannot be verified before the block is
imported. This would be a huge problem for a stateless client, which would be permanently
at risk to a DoS attack where peers feed it a long list of incorrect hashes. But Beam
Syncing clients are only vulnerable until they've finished downloading the full network
state, so the payoff for such an attack is smaller.

## Protocol Messages

### RESERVED (0x00)

This command is undefined, held in place for a possible future Status message.

### GetBlockWitnessHashes (0x01)

`[reqID: P, blockHash: B_32]`

Requests a list of trie node hashes used by a given block.

- `reqID`: Request ID to match up responses with
- `blockHash`: Hash of the header to request the witness hashes for

Notes:

- Nodes **must** always respond to the query.
- If the node does **not** have the trie hashes requested block, it **must** return an
  empty reply.

### BlockWitnessHashes (0x02)

`[reqID: P, witnessHashes: [trieNodeHash: B_32, ...]]`

Returns a list of the trie node hashes that were read during execution and validation of
the given block.

- `reqID`: ID of the request this is a response for
- `witnessHashes`: List of trie node hashes

## Change Log

### wit/0 (October 2020)

Version 0 was the introduction of the witness protocol.

[RLPx]: ../rlpx.md
[Beam Syncing]: https://github.com/ethereum/stateless-ethereum-specs/blob/master/beam-sync-phase0.md
