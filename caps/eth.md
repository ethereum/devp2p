# Ethereum Wire Protocol (ETH)

'eth' is a protocol on the [RLPx] transport that facilitates exchange of
Ethereum blockchain information between peers. The current protocol version is **eth/63**.
See end of document for a list of changes in past protocol versions.

### Basic Operation

Once a connection is established, a [Status] message must be sent. Following the reception
of the peer's Status message, the Ethereum session is active and any other messages may be
sent.

All known transactions should be sent following the Status exchange with one or more
[Transactions] messages.

[Transactions] messages should also be sent periodically as the node has new transactions
to disseminate. A node should never send a transaction back to a peer that it can
determine already knows of it (either because it was previously sent or because it was
informed from this peer originally).

Blocks are typically re-propagated to all connected peers as soon as basic validity of the
announcement has been established (e.g. after the proof-of-work check). Propagation uses
the [NewBlock] and [NewBlockHashes] messages. The [NewBlock] message includes the full
block and is sent to a small fraction of connected peers (usually the square root of the
total number of peers). All other peers are sent a [NewBlockHashes] message containing
just the hash of the new block. Those peers may request the full block later if they fail
to receive it from anyone within reasonable time.

### Chain Synchronization

Two peers get connected and send their [Status] message. Status includes the Total
Difficulty (TD) and hash of their best block.

The client with the worst TD then proceeds to download block headers using the
[GetBlockHeaders] message. It verifies proof-of-work values in received headers and
fetches block bodies using the [GetBlockBodies] message. Received blocks are executed
using the Ethereum Virtual Machine, recreating the state tree.

Note that header downloads, block body downloads and block execution may happen
concurrently.

### State Synchronization (a.k.a. "fast sync")

eth/63 also allows synchronizing transaction execution results ("state"). This may be
faster than re-executing all transactions but comes at the expense of some security.

State synchronization typically proceeds by downloading the chain of block headers,
verifying their proof-of-work values. Block bodies are requested as in the Chain
Synchronization section but block transactions aren't executed. Instead, the client picks
a block near the head of the chain and downloads merkle tree nodes and contract code
incrementally by requesting the root node, its children, grandchildren, ... using
[GetNodeData] until the entire tree is synchronized.

## Protocol Messages

### Status (0x00)

`[protocolVersion: P, networkId: P, td: P, bestHash: B_32, genesisHash: B_32]`

Inform a peer of its current state. This message should be sent just after the connection
is established and prior to any other eth protocol messages.

- `protocolVersion`: the current protocol version, 63
- `networkId`: Integer identifying the blockchain, see table below
- `td`: total difficulty of the best chain. Integer, as found in block header.
- `bestHash`: The hash of the best (i.e. highest TD) known block.
- `genesisHash`: The hash of the Genesis block.
- `number`: The block number of the latest block in the chain.

This table lists common Network IDs and their corresponding networks. Other IDs exist
which aren't listed, i.e. clients should not require that any particular network ID is
used. Note that the Network ID may or may not correspond with the EIP-155 Chain ID used
for transaction replay prevention.

| ID | chain                         |
|----|-------------------------------|
| 0  | Olympic (disused)             |
| 1  | Frontier (now mainnet)        |
| 2  | Morden (disused)              |
| 3  | Ropsten (current PoW testnet) |
| 4  | [Rinkeby]                     |

For a community curated list of chain IDs, see <https://chainid.network>.

### NewBlockHashes (0x01)

`[[hash_0: B_32, number_0: P], [hash_1: B_32, number_1: P], ...]`

Specify one or more new blocks which have appeared on the network. To be maximally
helpful, nodes should inform peers of all blocks that they may not be aware of. Including
hashes that the sending peer could reasonably be considered to know (due to the fact they
were previously informed of because that node has itself advertised knowledge of the
hashes through NewBlockHashes) is considered bad form, and may reduce the reputation of
the sending node. Including hashes that the sending node later refuses to honour with a
proceeding [GetBlockHeaders] message is considered bad form, and may reduce the reputation
of the sending node.

### Transactions (0x02)

`[[nonce: P, receivingAddress: B_20, value: P, ...], ...]`

Specify transactions that the peer should make sure is included on its transaction queue.
The items in the list are transactions in the format described in the main Ethereum
specification. Transactions messages must contain at least one (new) transaction, empty
Transactions messages are discouraged and may lead to disconnection.

Nodes must not resend the same transaction to a peer in the same session and must not
relay transactions to a peer they received that transaction from. In practice this is
often implemented by keeping a per-peer bloom filter or set of transaction hashes which
have already been sent or received.

### GetBlockHeaders (0x03)

`[block: {P, B_32}, maxHeaders: P, skip: P, reverse: P in {0, 1}]`

Require peer to return a [BlockHeaders] message. Reply must contain a number of block
headers, of rising number when `reverse` is `0`, falling when `1`, `skip` blocks apart,
beginning at block `block` (denoted by either number or hash) in the canonical chain, and
with at most `maxHeaders` items.

### BlockHeaders (0x04)

`[blockHeader_0, blockHeader_1, ...]`

Reply to [GetBlockHeaders]. The items in the list (following the message ID) are block
headers in the format described in the main Ethereum specification, previously asked for
in a GetBlockHeaders message. This may validly contain no block headers if none of the
requested block headers were found. The number of headers that can be requested in a
single message may be subject to implementation-defined limits.

### GetBlockBodies (0x05)

`[hash_0: B_32, hash_1: B_32, ...]`

Require peer to return a [BlockBodies] message. Specify the set of blocks that we're
interested in with the hashes. The number of blocks that can be requested in a single
message may be subject to implementation-defined limits.

### BlockBodies (0x06)

`[[transactions_0, uncles_0] , ...]`

Reply to [GetBlockBodies]. The items in the list are some of the blocks, minus the header,
in the format described in the main Ethereum specification, previously asked for in a
GetBlockBodies message. This may be empty if no blocks were available for the last
GetBlockBodies query.

### NewBlock (0x07)

`[[blockHeader, transactionList, uncleList], totalDifficulty]`

Specify a single block that the peer should know about. The composite item in the list
(following the message ID) is a block in the format described in the main Ethereum
specification.

- `totalDifficulty` is the total difficulty of the block (aka score).

### GetNodeData (0x0d)

`[hash_0: B_32, hash_1: B_32, ...]`

Require peer to return a [NodeData] message containing state tree nodes or contract code
matching the requested hashes.

### NodeData (0x0e)

`[value_0: B, value_1: B, ...]`

Provide a set of state tree nodes or contract code blobs which correspond to previously
requested hashes from [GetNodeData]. Does not need to contain all; best effort is fine. This
message may be an empty list if the peer doesn't know about any of the previously
requested hashes. The number of items that can be requested in a single message may be
subject to implementation-defined limits.

### GetReceipts (0x0f)

`[blockHash_0: B_32, blockHash_1: B_32, ...]`

Require peer to return a [Receipts] message containing the receipts of the given block
hashes. The number of receipts that can be requested in a single message may be subject to
implementation-defined limits.

### Receipts (0x10)

`[[receipt_0, receipt_1], ...]`

Provide a set of receipts which correspond to block hashes in a previous [GetReceipts]
message.

## Change Log

### eth/63 (2016)

Version 63 added the [GetNodeData], [NodeData], [GetReceipts] and [Receipts] messages
which allow synchronizing transaction execution results.

### eth/62 (2015)

In version 62, the [NewBlockHashes] message was extended to include block numbers
alongside the announced hashes. The block number in [Status] was removed. Messages
GetBlockHashes (0x03), BlockHashes (0x04), GetBlocks (0x05) and Blocks (0x06) were
replaced by messages that fetch block headers and bodies. The BlockHashesFromNumber (0x08)
message was removed.

Previous encodings of the reassigned/removed message codes were:

- GetBlockHashes (0x03): `[hash: B_32, maxBlocks: P]`
- BlockHashes (0x04): `[hash_0: B_32, hash_1: B_32, ...]`
- GetBlocks (0x05): `[hash_0: B_32, hash_1: B_32, ...]`
- Blocks (0x06): `[[blockHeader, transactionList, uncleList], ...]`
- BlockHashesFromNumber (0x08): `[number: P, maxBlocks: P]`

### eth/61 (2015)

Version 61 added the BlockHashesFromNumber (0x08) message which could be used to request
blocks in ascending order. It also added the latest block number to the [Status] message.

### eth/60 and below

Version numbers below 60 were used during the Ethereum PoC development phase.

- `0x00` for PoC-1
- `0x01` for PoC-2
- `0x07` for PoC-3
- `0x09` for PoC-4
- `0x17` for PoC-5
- `0x1c` for PoC-6

[RLPx]: ../rlpx.md
[Status]: #status-0x00
[NewBlockHashes]: #newblockhashes-0x01
[Transactions]: #transactions-0x02
[GetBlockHeaders]: #getblockheaders-0x03
[BlockHeaders]: #blockheaders-0x04
[GetBlockBodies]: #getblockbodies-0x05
[BlockBodies]: #blockbodies-0x06
[NewBlock]: #newblock-0x07
[GetNodeData]: #getnodedata-0x0d
[NodeData]: #nodedata-0x0e
[GetReceipts]: #getreceipts-0x0f
[Receipts]: #receipts-0x10
[Rinkeby]: https://rinkeby.io
