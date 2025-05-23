# Ethereum Wire Protocol (ETH)

'eth' is a protocol on the [RLPx] transport that facilitates exchange of Ethereum
blockchain information between peers. The current protocol version is **eth/69**. See end
of document for a list of changes in past protocol versions.

### Basic Operation

Once a connection is established, a [Status] message must be sent. Following the reception
of the peer's Status message, the Ethereum session is active and any other message may be
sent.

Within a session, two high-level tasks can be performed: chain synchronization and
transaction exchange. These tasks use disjoint sets of protocol messages and clients
typically perform them as concurrent activities on all peer connections.

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

The chain is obtained by downloading it from other peers. It is generally expected that
nodes respond to requests for headers, bodies, and receipts across the entire history
range. However, due to the large size of the mainnet, it was decided that early chain
history must be obtained in other ways, outside of the eth protocol, since it may not be
possible for all nodes to store the full mainnet history in perpetuity and provide random
access to it. As such, the protocol also provides means to announce the block range which
is available from a peer. For the Ethereum mainnet, client implementations must deal with
the absence of history on the eth protocol by either not syncing it at all, or by syncing
it via alternative means.

Since Ethereum consensus happens outside of the 'execution chain', there is no builtin
mechanism within this protocol to determine the canonical chain head. It is assumed that
every node is aware of the canonical chain somehow, be it through communication with a
consensus node, or by acting as a light client to the Ethereum consensus protocol.

With a known head of the chain, synchronization typically proceeds as follows: the node
will first fetch headers from the head down to the genesis block, using [GetBlockHeaders].
This process can be parallelized by first fetching a 'skeleton' structure of headers using
the `skip` parameter, then filling in the gaps using multiple peers.

Once headers have been downloaded, the client can proceed to fetching the full blocks
using [GetBlockBodies]. This can also utilize multiple peers since all block hashes are
known from the header chain. Retrieved block bodies must be validated against the headers.
The retrieved blocks are then executed by the EVM to obtain receipts and the state.

### State Synchronization (a.k.a. "fast sync", "snap sync")

Protocol versions eth/63 through eth/66 also allowed synchronizing the state tree.
Starting with version eth/67, the Ethereum state tree can no longer be retrieved using the
eth protocol, and state downloads are provided by the auxiliary [snap protocol] instead.

State synchronization typically proceeds by downloading the chain of block headers as
above, Block bodies are requested as in the Chain Synchronization section but transactions
aren't executed, only their 'data validity' is verified. The client picks a block near the
head of the chain (the 'pivot block') and downloads the state of that block.

Since state synchronization does not execute transactions, the node wouldn't have any of
the receipts of execution available after synchronizing the state. In order to participate
fully in the p2p protocol, receipts also need to be downloaded during state
synchronization using the [GetReceipts] message.

### Block Propagation

**Note: after the PoW-to-PoS transition ([The Merge]), block propagation is no longer
handled by the 'eth' protocol. The text below only applies to PoW and PoA (clique)
networks. Block propagation messages (NewBlock, NewBlockHashes...) will be removed from
the protocol in a future version.**

Newly-mined blocks must be relayed to all nodes. This happens through block propagation,
which is a two step process. When a [NewBlock] announcement message is received from a
peer, the client first verifies the basic header validity of the block, checking whether
the proof-of-work value is valid. It then sends the block to a small fraction of connected
peers (usually the square root of the total number of peers) using the [NewBlock] message.

After the header validity check, the client imports the block into its local chain by
executing all transactions contained in the block, computing the block's 'post state'. The
block's `state-root` hash must match the computed post state root. Once the block is fully
processed, and considered valid, the client sends a [NewBlockHashes] message about the
block to all peers which it didn't notify earlier. Those peers may request the full block
later if they fail to receive it via [NewBlock] from anyone else.

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

### Transaction Encoding and Validity

Transaction objects exchanged by peers have one of two encodings. In definitions across
this specification, we refer to transactions of either encoding using the identifier `txₙ`.

    tx = {legacy-tx, typed-tx}

Untyped, legacy transactions are given as an RLP list.

    legacy-tx = [
        nonce: P,
        gas-price: P,
        gas-limit: P,
        recipient: {B_0, B_20},
        value: P,
        data: B,
        V: P,
        R: P,
        S: P,
    ]

[EIP-2718] typed transactions are encoded as RLP byte arrays where the first byte is the
transaction type (`tx-type`) and the remaining bytes are opaque type-specific data.

    typed-tx = tx-type || tx-data

Transactions must be validated when they are received. Validity depends on the Ethereum
chain state. The specific kind of validity this specification is concerned with is not
whether the transaction can be executed successfully by the EVM, but only whether it is
acceptable for temporary storage in the local pool and for exchange with other peers.

Transactions are validated according to the rules below. While the encoding of typed
transactions is opaque, it is assumed that their `tx-data` provides values for `nonce`,
`gas-price`, `gas-limit`, and that the sender account of the transaction can be determined
from their signature.

- If the transaction is typed, the `tx-type` must be known to the implementation. Defined
  transaction types may be considered valid even before they become acceptable for
  inclusion in a block. Implementations should disconnect peers sending transactions of
  unknown type.
- The signature must be valid according to the signature schemes supported by the chain.
  For typed transactions, signature handling is defined by the EIP introducing the type.
  For legacy transactions, the two schemes in active use are the basic 'Homestead' scheme
  and the [EIP-155] scheme.
- The `gas-limit` must cover the 'intrinsic gas' of the transaction.
- The sender account of the transaction, which is derived from the signature, must have
  sufficient ether balance to cover the cost (`gas-limit * gas-price + value`) of the
  transaction.
- The `nonce` of the transaction must be equal or greater than the current nonce of the
  sender account.
- When considering the transaction for inclusion in the local pool, it is up to
  implementations to determine how many 'future' transactions with nonce greater than the
  current account nonce are valid, and to which degree 'nonce gaps' are acceptable.

Implementations may enforce other validation rules for transactions. For example, it is
common practice to reject encoded transactions larger than 128 kB.

Unless noted otherwise, implementations must not disconnect peers for sending invalid
transactions, and should simply discard them instead. This is because the peer might be
operating under slightly different validation rules.

### Block Encoding and Validity

Ethereum block headers are encoded as follows:

    header = [
        parent-hash: B_32,
        ommers-hash: B_32,
        coinbase: B_20,
        state-root: B_32,
        txs-root: B_32,
        receipts-root: B_32,
        bloom: B_256,
        difficulty: P,
        number: P,
        gas-limit: P,
        gas-used: P,
        time: P,
        extradata: B,
        mix-digest: B_32,
        block-nonce: B_8,
        basefee-per-gas: P,
        withdrawals-root: B_32,
        blob-gas-used: P,
        excess-blob-gas: P,
        parent-beacon-root: B_32,
        requests-hash: B_32,
    ]

In certain protocol messages, the transaction and ommer lists are relayed together as a
single item called the 'block body'.

    block-body = [transactions, ommers, withdrawals]
    transactions = [tx₁, tx₂, ...]
    ommers = [header₁, header₂, ...]
    withdrawals = [withdrawal₁, withdrawal₂, ...]

For the purpose of block propagation (now defunct), full blocks were relayed as a combined item:

    block = [header, transactions, ommers]

The validity of block headers depends on the context in which they are used. For a single
block header, only the validity of the proof-of-work seal (`mix-digest`, `block-nonce`)
can be verified. When a header is used to extend the client's local chain, or multiple
headers are processed in sequence during chain synchronization, the following rules apply:

- Headers must form a chain where block numbers are consecutive and the `parent-hash` of
  each header matches the hash of the preceding header.
- When extending the locally-stored chain, implementations must also verify that the
  values of `difficulty`, `gas-limit` and `time` are within the bounds of protocol rules
  given in the [Yellow Paper].
- The `gas-used` header field must be less than or equal to the `gas-limit`.
- `basefee-per-gas` must be present in headers after the [London hard fork]. It must be
  absent for earlier blocks. This rule was added by [EIP-1559].
- For PoS blocks after [The Merge], `ommers-hash` must be the empty keccak256 hash since
  no ommer headers can exist.
- `withdrawals-root` must be present in headers after the [Shanghai fork]. The field must
  be absent for blocks before the fork. This rule was added by [EIP-4895].
- `blob-gas-used`, `excess-blob-gas`, `parent-beacon-root`, must be present in headers
  after the [Cancun fork], and absent for earlier blocks. This rule was
  added by [EIP-4844] and [EIP-4788].
- `requests-hash` must be present in headers after the Prague fork, and absent for
  earlier blocks. This rule was added by [EIP-7685].

For complete blocks, we distinguish between the validity of the block's EVM state
transition, and the (weaker) 'data validity' of the block. The definition of state
transition rules is not dealt with in this specification. We require data validity of the
block for the purposes of immediate [block propagation] and during [state synchronization].

To determine the data validity of a block, use the rules below. Implementations should
disconnect peers sending invalid blocks.

- The block `header` must be valid.
- The `transactions` contained in the block must be valid for inclusion into the chain at
  the block's number. This means that, in addition to the transaction validation rules
  given earlier, validating whether the `tx-type` is permitted at the block number is
  required, and validation of transaction gas must take the block number into account.
- The sum of the `gas-limit`s of all transactions must not exceed the `gas-limit` of the
  block.
- The `transactions` of the block must be verified against the `txs-root` by computing and
  comparing the merkle trie hash of the transactions list.
- The `withdrawals` of block body must be verified against the `withdrawals-root` by
  computing and comparing the merkle trie hash of the withdrawals list. Note that no
  further validation of withdrawals is possible, since they are injected into the block by
  the consensus layer.
- The `ommers` list may contain at most two headers.
- `keccak256(ommers)` must match the `ommers-hash` of the block header.
- The headers contained in the `ommers` list must be valid headers. Their block number
  must not be greater than that of the block they are included in. The parent hash of an
  ommer header must refer to an ancestor of depth 7 or less of its including block, and it
  must not have been included in any earlier block contained in this ancestor set.

### Receipt Encoding and Validity

Receipts are the output of the EVM state transition of a transaction. They are made
available for the purpose of syncing the chain without re-executing transactions. All
receipts have the same encoding regardless of transaction type.

    receiptₙ = [
        tx-type: P,
        post-state-or-status: B,
        cumulative-gas: P,
        logs: [log₁, log₂, ...],
    ]
    logₙ = [
        address: B_20,
        topics: [topic₁: B, topic₂: B, ...],
        data: B,
    ]

In the Ethereum Wire Protocol, receipts are always transferred as the complete list of all
receipts contained in a block. It is also assumed that the block containing the receipts
is valid and known. When a list of block receipts is received by a peer, it must be
verified by computing and comparing the merkle trie hash of the list against the
`receipts-root` of the block. Note that in order to perform this verification, the
receipts need to be re-encoded into the format used by the Ethereum consensus protocol,
and their bloom filters have to be recomputed.

Since the valid list of receipts is determined by the EVM state transition, it is not
necessary to define any further validity rules for receipts in this specification.

## Protocol Messages

In most messages, the first element of the message data list is the `request-id`. For
requests, this is a 64-bit integer value chosen by the requesting peer. The responding
peer must mirror the value in the `request-id` element of the response message.

### Status (0x00)

`[vsn: P, networkid: P, genesis: B_32, forkid, earliest: P, latest: P, latestHash: B_32]`

This is the initial message, informing the peer about the local node state and
configuration. This message should be sent just after the connection is established and
prior to any other eth protocol messages.

- `vsn`: the current protocol version
- `networkid`: integer identifying the blockchain, see table below
- `genesis`: the hash of the genesis block
- `forkid`: An [EIP-2124] fork identifier, encoded as `[fork-hash, fork-next]`.

The Status message also announces the available block range. See [BlockRangeUpdate] for
more information.

- `earliest`: number of the earliest available full block
- `latest`: number of the latest available full block number
- `latestHash`: hash of the latest available full block

This table lists common Network IDs and their corresponding networks. Other IDs exist
which aren't listed, i.e. clients should not require that any particular network ID is
used. Note that the Network ID may or may not correspond with the EIP-155 Chain ID used
for transaction replay prevention.

| ID | chain                     |
|----|---------------------------|
| 0  | Olympic (disused)         |
| 1  | Frontier (now mainnet)    |
| 2  | Morden testnet (disused)  |
| 3  | Ropsten testnet (disused) |
| 4  | Rinkeby testnet (disused) |
| 5  | Goerli testnet            |

For a community curated list of chain IDs, see <https://chainid.network>.

### NewBlockHashes (0x01)

`[[blockhash₁: B_32, number₁: P], [blockhash₂: B_32, number₂: P], ...]`

Specify one or more new blocks which have appeared on the network. To be maximally
helpful, nodes should inform peers of all blocks that they may not be aware of. Including
hashes that the sending peer could reasonably be considered to know (due to the fact they
were previously informed of because that node has itself advertised knowledge of the
hashes through NewBlockHashes) is considered bad form, and may reduce the reputation of
the sending node. Including hashes that the sending node later refuses to honour with a
proceeding [GetBlockHeaders] message is considered bad form, and may reduce the reputation
of the sending node.

### Transactions (0x02)

`[tx₁, tx₂, ...]`

Specify transactions that the peer should make sure is included on its transaction queue.
The items in the list are transactions in the format described in the main Ethereum
specification. Transactions messages must contain at least one (new) transaction, empty
Transactions messages are discouraged and may lead to disconnection.

Nodes must not resend the same transaction to a peer in the same session and must not
relay transactions to a peer they received that transaction from. In practice this is
often implemented by keeping a per-peer bloom filter or set of transaction hashes which
have already been sent or received.

### GetBlockHeaders (0x03)

`[request-id: P, [startblock: {P, B_32}, limit: P, skip: P, reverse: {0, 1}]]`

Require peer to return a BlockHeaders message. The response must contain a number of block
headers, of rising number when `reverse` is `0`, falling when `1`, `skip` blocks apart,
beginning at block `startblock` (denoted by either number or hash) in the canonical chain,
and with at most `limit` items.

### BlockHeaders (0x04)

`[request-id: P, [header₁, header₂, ...]]`

This is the response to GetBlockHeaders, containing the requested headers. The header list
may be empty if none of the requested block headers were found. The number of headers that
can be requested in a single message may be subject to implementation-defined limits.

The recommended soft limit for BlockHeaders responses is 2 MiB.

### GetBlockBodies (0x05)

`[request-id: P, [blockhash₁: B_32, blockhash₂: B_32, ...]]`

This message requests block body data by hash. The number of blocks that can be requested
in a single message may be subject to implementation-defined limits.

### BlockBodies (0x06)

`[request-id: P, [block-body₁, block-body₂, ...]]`

This is the response to GetBlockBodies. The items in the list contain the body data of the
requested blocks. The list may be empty if none of the requested blocks were available.

The recommended soft limit for BlockBodies responses is 2 MiB.

### NewBlock (0x07)

`[block, td: P]`

Specify a single complete block that the peer should know about. `td` is the total
difficulty of the block, i.e. the sum of all block difficulties up to and including this
block.

### NewPooledTransactionHashes (0x08)

`[txtypes: B, [txsize₁: P, txsize₂: P, ...], [txhash₁: B_32, txhash₂: B_32, ...]]`

This message announces one or more transactions that have appeared in the network and
which have not yet been included in a block. The message payload describes a list of of
transactions, but note that it is encoded as three separate elements.

The `txtypes` element is a byte array containing the announced [transaction types]. The
other two payload elements refer to the sizes and hashes of the announced transactions.
All three payload elements must contain an equal number of items.

`txsizeₙ` refers to the length of the 'consensus encoding' of a typed transaction, i.e.
the byte size of `tx-type || tx-data` for typed transactions, and the size of the
RLP-encoded `legacy-tx` for non-typed legacy transactions.

The recommended soft limit for this message is 4096 items (~150 KiB).

To be maximally helpful, nodes should inform peers of all transactions that they may not
be aware of. However, nodes should only announce hashes of transactions that the remote
peer could reasonably be considered not to know, but it is better to return more
transactions than to have a nonce gap in the pool.

### GetPooledTransactions (0x09)

`[request-id: P, [txhash₁: B_32, txhash₂: B_32, ...]]`

This message requests transactions from the recipient's transaction pool by hash.

The recommended soft limit for GetPooledTransactions requests is 256 hashes (8 KiB). The
recipient may enforce an arbitrary limit on the response (size or serving time), which
must not be considered a protocol violation.

### PooledTransactions (0x0a)

`[request-id: P, [tx₁, tx₂...]]`

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

### GetReceipts (0x0f)

`[request-id: P, [blockhash₁: B_32, blockhash₂: B_32, ...]]`

Require peer to return a Receipts message containing the receipts of the given block
hashes. The number of receipts that can be requested in a single message may be subject to
implementation-defined limits.

### Receipts (0x10)

`[request-id: P, [[receipt₁, receipt₂], ...]]`

This is the response to GetReceipts, providing the requested block receipts. Each element
in the response list corresponds to a block hash of the GetReceipts request, and must
contain the complete list of receipts of the block.

The recommended soft limit for Receipts responses is 2 MiB.

### BlockRangeUpdate (0x11)

`[earliest: P, latest: P, latestHash: B_32]`

This is a notification about a change in the available block range on a peer.

With this message, the peer announces that all blocks `b` with `earliest >= b >= latest`
are available via [GetBlockBodies], and also that receipts for these blocks are available
via [GetReceipts]. Headers are always assumed to be available for the full range of blocks
from genesis.

The notification doesn't need to be sent for every update to the node's head block. It is
recommended to send an update about once every two minutes. Clients should validate
received updates.

- If `earliest > latest`, the peer should be disconnected.
- Updates can be used to detect the condition where a node is surrounded by syncing peers.
  At the same time, client implementations must take care to not disconnect all syncing
  peers purely on the basis of their BlockRangeUpdate.

## Change Log

### eth/69 ([EIP-7642], April 2025)

Version 69 changed the [Status] message to include information about the available block
range. A new [BlockRangeUpdate] message was added to notify peers about changes in block
range. The [Receipts] message was changed to simplify the encoding of typed receipts and
to remove the bloom filter.

### eth/68 ([EIP-5793], October 2022)

Version 68 changed the [NewPooledTransactionHashes] message to include types and sizes of
the announced transactions. Prior to this update, the message payload was simply a list of
hashes: `[txhash₁: B_32, txhash₂: B_32, ...]`.

### eth/67 with withdrawals ([EIP-4895], March 2022)

PoS validator withdrawals were added by [EIP-4895], which changed the definition of block
headers to include a `withdrawals-root`, and block bodies to include the `withdrawals`
list. No new wire protocol version was created for this change, since it was only a
backwards-compatible addition to the block validity rules.

### eth/67 ([EIP-4938], March 2022)

Version 67 removed the GetNodeData and NodeData messages.

- GetNodeData (0x0d)
  `[request-id: P, [hash₁: B_32, hash₂: B_32, ...]]`
- NodeData (0x0e)
  `[request-id: P, [value₁: B, value₂: B, ...]]`

### eth/66 ([EIP-2481], April 2021)

Version 66 added the `request-id` element in messages [GetBlockHeaders], [BlockHeaders],
[GetBlockBodies], [BlockBodies], [GetPooledTransactions], [PooledTransactions],
GetNodeData, NodeData, [GetReceipts], [Receipts].

### eth/65 with typed transactions ([EIP-2976], April 2021)

When typed transactions were introduced by [EIP-2718], client implementers decided to
accept the new transaction and receipt formats in the wire protocol without increasing the
protocol version. This specification update also added definitions for the encoding of all
consensus objects instead of referring to the Yellow Paper.

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

Version 63 added the GetNodeData, NodeData, [GetReceipts] and [Receipts] messages
which allow synchronizing transaction execution results.

### eth/62 (2015)

In version 62, the [NewBlockHashes] message was extended to include block numbers
alongside the announced hashes. The block number in [Status] was removed. Messages
GetBlockHashes (0x03), BlockHashes (0x04), GetBlocks (0x05) and Blocks (0x06) were
replaced by messages that fetch block headers and bodies. The BlockHashesFromNumber (0x08)
message was removed.

Previous encodings of the reassigned/removed message codes were:

- GetBlockHashes (0x03): `[hash: B_32, max-blocks: P]`
- BlockHashes (0x04): `[hash₁: B_32, hash₂: B_32, ...]`
- GetBlocks (0x05): `[hash₁: B_32, hash₂: B_32, ...]`
- Blocks (0x06): `[[header, transactions, ommers], ...]`
- BlockHashesFromNumber (0x08): `[number: P, max-blocks: P]`

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

[block propagation]: #block-propagation
[state synchronization]: #state-synchronization-aka-fast-sync-snap-sync
[snap protocol]: ./snap.md
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
[GetReceipts]: #getreceipts-0x0f
[Receipts]: #receipts-0x10
[BlockRangeUpdate]: #blockrangeupdate-0x11
[RLPx]: ../rlpx.md
[EIP-155]: https://eips.ethereum.org/EIPS/eip-155
[EIP-1559]: https://eips.ethereum.org/EIPS/eip-1559
[EIP-2124]: https://eips.ethereum.org/EIPS/eip-2124
[EIP-2364]: https://eips.ethereum.org/EIPS/eip-2364
[EIP-2464]: https://eips.ethereum.org/EIPS/eip-2464
[EIP-2481]: https://eips.ethereum.org/EIPS/eip-2481
[EIP-2718]: https://eips.ethereum.org/EIPS/eip-2718
[transaction types]: https://eips.ethereum.org/EIPS/eip-2718
[EIP-2976]: https://eips.ethereum.org/EIPS/eip-2976
[EIP-4788]: https://eips.ethereum.org/EIPS/eip-4788
[EIP-4895]: https://eips.ethereum.org/EIPS/eip-4895
[EIP-4844]: https://eips.ethereum.org/EIPS/eip-4844
[EIP-4938]: https://eips.ethereum.org/EIPS/eip-4938
[EIP-5793]: https://eips.ethereum.org/EIPS/eip-5793
[EIP-7642]: https://eips.ethereum.org/EIPS/eip-7642
[EIP-7685]: https://eips.ethereum.org/EIPS/eip-7685
[The Merge]: https://eips.ethereum.org/EIPS/eip-3675
[London hard fork]: https://github.com/ethereum/execution-specs/blob/master/network-upgrades/mainnet-upgrades/london.md
[Shanghai fork]: https://github.com/ethereum/execution-specs/blob/master/network-upgrades/mainnet-upgrades/shanghai.md
[Cancun fork]: https://github.com/ethereum/execution-specs/blob/master/network-upgrades/mainnet-upgrades/cancun.md
[Yellow Paper]: https://ethereum.github.io/yellowpaper/paper.pdf
