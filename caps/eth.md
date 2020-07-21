# Ethereum Wire Protocol (ETH)

'eth' is a protocol on the [RLPx] transport that facilitates exchange of Ethereum
blockchain information between peers. The current protocol version is **eth/65**. See end
of document for a list of changes in past protocol versions.

### Basic Operation

Once a connection is established, a [Status] message must be sent. Following the reception
of the peer's Status message, the Ethereum session is active and any other message may be
sent.

Within a session, three high-level tasks can be performed: chain synchronization, block
propagation and transaction exchange. These tasks use disjoint sets of protocol messages
and clients typically perform them as concurrent activities on all peer connections.

Client implementations should enforce limits on protocol message sizes. The underlying
RLPx transport limits the size of a single message to 16.7 MiB. The practical limits for
the eth protocol are lower, typically 10 MiB. If a received message is larger than the
limit, the peer should be disconnected.

In addition to the hard limit on received messages, clients should also impose 'soft'
limits on the requests and responses which they send. The recommended soft limit varies
per message type. Limiting requests and responses ensures that concurrent activity, e.g.
block synchronization and transaction exchange work smoothly over the same peer
connection.

### Chain Synchronization

Nodes participating in the eth protocol are expected to have knowledge of the complete
chain of all blocks from the genesis block to current, latest block. The chain is obtained
by downloading it from other peers.

Upon connection, both peers send their [Status] message, which includes the Total
Difficulty (TD) and hash of their 'best' known block.

The client with the worst TD then proceeds to download block headers using the
[GetBlockHeaders] message. It verifies proof-of-work values in received headers and
fetches block bodies using the [GetBlockBodies] message. Received blocks are executed
using the Ethereum Virtual Machine, recreating the state tree and receipts.

Note that header downloads, block body downloads and block execution may happen
concurrently.

### State Synchronization (a.k.a. "fast sync")

Protocol versions eth/63 and later also allow synchronizing transaction execution results
(i.e. state tree and receipts). This may be faster than re-executing all historical
transactions but comes at the expense of some security.

State synchronization typically proceeds by downloading the chain of block headers,
verifying their proof-of-work values. Block bodies are requested as in the Chain
Synchronization section but block transactions aren't executed. Instead, the client picks
a block near the head of the chain and downloads merkle tree nodes and contract code
incrementally by requesting the root node, its children, grandchildren, ... using
[GetNodeData] until the entire tree is synchronized.

### Block Propagation

Newly-mined blocks must be relayed to all nodes. This happens through block propagation,
which is a two step process. When a [NewBlock] announcement message is received from a
peer, the client first verifies the basic validity of the block and checks that the
proof-of-work value is valid. It then sends the block to a small fraction of connected
peers (usually the square root of the total number of peers) using the [NewBlock] message.

After the proof-of-work check, the client imports the block into its local chain by
executing all transactions contained in the block, computing the block's 'post state'. The
block's state root hash must match the computed post state root. Once the block is fully
processed the client sends a [NewBlockHashes] message about the block to all peers which
it didn't notify earlier. Those peers may request the full block later if they fail to
receive it via [NewBlock] from anyone else.

A node should never send a block announcement back to a peer which previously announced
the same block. This is usually achieved by remembering a large set of block hashes
recently relayed to or from each peer.

The reception of a block announcement may also trigger chain synchronization if the block
is not the immediate successor of the client's current latest block.

### Transaction Exchange

All nodes must exchange pending transactions in order to relay them to miners, which will
pick them for inclusion into the blockchain. Client implementations keep track of the set
of pending transactions in the 'transaction pool'. The pool is subject to client-specific
limits and can contain many (i.e. thousands of) transactions.

When a new peer connection is established, the transaction pools on both sides need to be
synchronized. Initially, both ends should send [NewPooledTransactionHashes] messages
containing all transaction hashes in the local pool to start the exchange.

On receipt of a NewPooledTransactionHashes announcement, the client filters the received
set, collecting transaction hashes which it doesn't yet have in its own local pool. It can
then request the transactions using the [GetPooledTransactions] message.

When new transactions appear in the client's pool, it should propagate them to the network
using the [Transactions] and [NewPooledTransactionHashes] messages. The Transactions
message relays complete transaction objects and is typically sent to a small, random
fraction of connected peers. All other peers receive a notification of the transaction
hash and can request the complete transaction object if it is unknown to them. The
dissemination of complete transactions to a fraction of peers usually ensures that all
nodes receive the transaction and won't need to request it.

A node should never send a transaction back to a peer that it can determine already knows
of it (either because it was previously sent or because it was informed from this peer
originally). This is usually achieved by remembering a set of transaction hashes recently
relayed by the peer.

Transactions must be validated before re-propagating them. Relaying an invalid transaction
results in peer disconnection.

## Protocol Messages

### Status (0x00)

`[protocolVersion: P, networkId: P, td: P, bestHash: B_32, genesisHash: B_32, forkID]`

Inform a peer of its current state. This message should be sent just after the connection
is established and prior to any other eth protocol messages.

- `protocolVersion`: the current protocol version
- `networkId`: Integer identifying the blockchain, see table below
- `td`: total difficulty of the best chain. Integer, as found in block header.
- `bestHash`: The hash of the best (i.e. highest TD) known block.
- `genesisHash`: The hash of the Genesis block.
- `number`: The block number of the latest block in the chain.
- `forkID`: An [EIP-2124] fork identifier, encoded as `[forkHash, forkNext]`.

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

The recommended soft limit for BlockHeaders responses is 2 MiB.

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

The recommended soft limit for BlockBodies responses is 2 MiB.

### NewBlock (0x07)

`[[blockHeader, transactionList, uncleList], totalDifficulty]`

Specify a single block that the peer should know about. The composite item in the list
(following the message ID) is a block in the format described in the main Ethereum
specification.

- `totalDifficulty` is the total difficulty of the block (aka score).

### NewPooledTransactionHashes (0x08)

`[hash_0: B_32, hash_1: B_32, ...]`

This message announces one or more transactions that have appeared in the network and
which have not yet been included in a block. To be maximally helpful, nodes should inform
peers of all transactions that they may not be aware of.

The recommended soft limit for this message is 4096 hashes (128 KiB).

Nodes should only announce hashes of transactions that the remote peer could reasonably be
considered not to know, but it is better to return more transactions than to have a nonce
gap in the pool.

### GetPooledTransactions (0x09)

`[hash_0: B_32, hash_1: B_32, ...]`

This message requests transactions from the recipient's transaction pool by hash.

The recommended soft limit for GetPooledTransactions requests is 256 hashes (8 KiB). The
recipient may enforce an arbitrary limit on the response (size or serving time), which
must not be considered a protocol violation.

### PooledTransactions (0x0a)

`[[nonce: P, receivingAddress: B_20, value: P, ...], ...]`

This is the response to GetPooledTransactions, returning the requested transactions from
the local pool. The items in the list are transactions in the format described in the main
Ethereum specification.

The transactions must be in same order as in the request, but it is OK to skip
transactions which are not available. This way, if the response size limit is reached,
requesters will know which hashes to request again (everything starting from the last
returned transaction) and which to assume unavailable (all gaps before the last returned
transaction).

It is permissible to first announce a transaction via NewPooledTransactionHashes, but then
to refuse serving it via PooledTransactions. This situation can arise when the transaction
is included in a block (and removed from the pool) in between the announcement and the
request.

A peer may respond with an empty list iff none of the hashes match transactions in its
pool.

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

The recommended soft limit for NodeData responses is 2 MiB.

### GetReceipts (0x0f)

`[blockHash_0: B_32, blockHash_1: B_32, ...]`

Require peer to return a [Receipts] message containing the receipts of the given block
hashes. The number of receipts that can be requested in a single message may be subject to
implementation-defined limits.

### Receipts (0x10)

`[[receipt_0, receipt_1], ...]`

Provide a set of receipts which correspond to block hashes in a previous [GetReceipts]
message.

The recommended soft limit for Receipts responses is 2 MiB.

## Change Log

### eth/65 ([EIP-2464], January 2020)

Version 65 improved transaction exchange, introducing three additional messages:
[NewPooledTransactionHashes], [GetPooledTransactions], and [PooledTransactions].

Prior to version 65, peers always exchanged complete transaction objects. As activity and
transaction sizes increased on the Ethereum mainnet, the network bandwidth used for
transaction exchange became a significant burden on node operators. The update reduced the
required bandwidth by adopting a two-tier transaction broadcast system similar to block
propagation.

### eth/64 ([EIP-2364], November 2019)

Version 64 changed the [Status] message to include the [EIP-2124] ForkID. This allows
peers to determine mutual compatibility of chain execution rules without synchronizing the
blockchain.

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
[NewPooledTransactionHashes]: #newpooledtransactionhashes-0x08
[GetPooledTransactions]: #getpooledtransactions-0x09
[PooledTransactions]: #pooledtransactions-0x0a
[GetNodeData]: #getnodedata-0x0d
[NodeData]: #nodedata-0x0e
[GetReceipts]: #getreceipts-0x0f
[Receipts]: #receipts-0x10
[Rinkeby]: https://rinkeby.io
[EIP-2124]: https://eips.ethereum.org/EIPS/eip-2124
[EIP-2364]: https://eips.ethereum.org/EIPS/eip-2364
[EIP-2464]: https://eips.ethereum.org/EIPS/eip-2464
