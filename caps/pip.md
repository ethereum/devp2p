# Parity Light Protocol (PIP)

The Parity Light Protocol is a variation of LES designed and implemented by Parity Tech
for the Parity Ethereum client. Please refer to the [LES specification] for information on
the purpose of the light client protocol.

Like LES, PIP adopts a flow-control mechanism closely analogous to a [token-bucket rate
limiter] where the client is expected to mirror the server token-bucket state (as
exceeding the 'burstiness' depth is a violation that results in disconnection). PIP
utilises [Canonical Hash Tries] \(CHTs), which are also described in the LES documentation.
Unlike LES, a PIP CHT is generated once every 2048 blocks. One 32-byte trie root is stored
for every range of 2048 blocks.

The current version is **pip/1**. This specification was derived from the official
specification at <https://wiki.parity.io>. However, the official specification has since
been deleted.

## Notation

Throughout this document, and in accordance with other devp2p documents, when referring to
wire message formats the following symbols apply:

`[ .. , .. , .. ]` means an RLP list

`a || b` means concatenation of `a` and `b`

`...` means additional list elements

## Handshake

After the initial RLPx handshake, the first message that must be communicated is from the
server to the light peer and is a status message. Updates to information in the status
message are supplied with announcements.

### Status (0x00)

`[[key0, value0], [key1, value1], ...]`

Keys are strings. Mandatory keys and values are as follows:

- `"protocol_version"` 1 for this PIP/1 protocol version.
- `"network_id"` 0 for testnet, 1 for mainnet
- `"total_difficulty"` integer total difficulty of the best chain as found in the block header.
- `"head_blockhash"`  the hash of the best (i.e. highest total difficulty) known block.
- `"head_blocknum"` the number of the best (i.e. highest total difficulty) known block.
- `"genesisHash""` the hash of the genesis block.

Optional keys and values are as follows:

- `"serve_headers"` any value and key-pair present if the peer can serve header chain
  downloads.
- `"serve_chain_since"` present if the peer can serve Body/Receipts ODR requests starting
  from the given block number.
- `"serve_state_since"` present if the peer can serve Proof/Code ODR requests starting
  from the given block number.
- `"tx_relay"` present if the peer can relay transactions to the network.
- `"flow_control_bl"` max credits (positive integer describing the burst-depth of the
  token bucket),
- `"flow_control_mrc"` the initial cost table (see below)
- `"flow_control_mrr"` rate of recharge (positive integer of credits recharged per second)

#### Cost Table

The cost table includes a mapping of individual [PIP Request/Response Messages] to costs,
which are applied in the token-bucket rate limiter. The [Headers] and [Execution] request
messages are special cases where the cost is multiplied by the maximum number of requested
header or gas requested, respectively. The table also includes a base cost, which is
applied for every [Request Batch].

    cost_table = [base_cost, [id,cost],...]
    base_cost = positive integer cost applied to a request batch.
    id = identifier of an individual PIP message type
    cost = positive integer to apply to cost calculations for this message type

### Announcement (0x01)

`[head_blockhash, head_blocknum, total_difficulty, reorg_depth, [key0, value0], [key1, value1], ...]`

- `reorg_depth` is positive integer containing the reorganization depth to the common
  ancestor of the new head and the last announced head.
- Other elements have the same meaning as in the [Status] message with the exception of
  `reorg_depth`.

### Request Batch (0x02)

`[request-id, [req1, ...]]`

where

- `request-id` is a unique scalar request identifier for request-reply correlation.
- `[req1, ...]` is the list of request messages, as described in the [PIP Request/Response Messages]
  section.

This message, sent from client to server, requests that the given request messages should
be executed. The server responds with a Response Batch.

### Response Batch (0x03)

`[request-id, cr, [resp1, ...]]`

where

- `request-id1` is the unique scalar correlating with a previously received request message.
- `cr` is an updated amount of request credits prior to recharge events at the time of
  processing on the server (please see throttling below).
- `[resp1, ...]` is the list of response messages.

There must be a response message for each request contained in the corresponding request batch.
The individual responses must supply all elements of the response message specifications.
The PIP protocol considers messages missing any of these elements *incomplete*.

### UpdateCreditParameters (0x04)

`[max, recharge, cost_table]`

where

- `max` is a positive integer, the new maximum credit depth for the token bucket.
- `recharge` a positive integer, the new recharge rate in credits per second.
- `cost_table` is the updated [Cost Table].

The server may periodically update the token-bucket parameters, such as depth, message
cost and recharge rate, for the particular client. Received updates must be acknowledged
with an AcknowledgeUpdate message.

### AcknowledgeUpdate (0x05)

This message acknowledges receipt of updated credit parameters and has no payload.

### RelayTransactions (0x06)

`[tx1, tx2, ...]`

where

`tx1`, `tx2` are RLP encoded transactions as per [ETH] documentation.

This message requests that the given transactions should be relayed to the
to the eth network.

## PIP Request/Response Messages

PIP request and response messages are batched and cannot be sent individually. Unlike LES,
PIP batches may contain multiple messages of different types. The [Request Batch] is used
to send messages of the types described below to the server.

Each message type also specifies its corresponding response message (referred to as
*outputs*). Response messages are sent as a [Response Batch] by the server when requests
have executed.

PIP tries to further optimise client-server round trips by allowing the individual
requests in the batch to include references to what their responses would contain if
processed sequentially. For clarification, an example PIP batch request could contain two
request messages in order, where the second message specifies that an input is a specific
'output' of the first message, where 'output' means the server response to that request.

Referencing a field in a response to a batched request is achieved with *loose inputs* and
*reusable outputs*. Response message fields are documented as being **reusable as `n`**
where `n` is an identifier labelling the field in the response message body.

*Loose inputs* may be a back-reference to a *reusable output* or may be hard data.

    loose_input = [raw_flag, input]
    raw_flag = is 0 or 1 (a.k.a. 'discriminant')
    input = if raw_flag is 0, this is the RLP encoded value
            if raw_flag is 1, this is back_reference
    back_reference = [request_message_index, reusable_output]
    request_message_index = the 0-based position of a prior message in the request batch
    reusable_output = the unsigned integer identifying the corresponding response message field

The following are the individual messages, paired as requests and their responses.

### Headers (0x00)

Request and retrieve block headers from the server.

#### Request

`[message-id, [start, skip, max, reverse]]`

- `start` Loose, of type either 32byte hash (block hash), or unsigned integer block number
- `skip` unsigned integer N, specifying the server should return every Nth block
- `max` unsinged integer, the maximum number of blocks to return
- `reverse` 0 if the block numbers should be increasing, 1 to return in reverse order

#### Response

`[message-id, [header1, header2, ...]]`

- `header1, header2, ...` the requested block headers

### HeaderProof (0x01)

Request for a header proof.

#### Request

`[message-id, [block]]`

- `block` Loose, of type unsigned integer, referring to the block number

#### Response

`[message-id, [cht_inclusion_proof, block_hash, total_difficulty]]`

- `cht_inclusion_proof` is `[[node1, node2, ...], ...]`
- `node1` merkle tree node as byte array
- `block_hash` hash of the requested block **reusable as 0**
- `total_difficulty` unsigned integer, the requested block total difficulty

### TransactionIndex (0x02)

Request for transaction inclusion information by transaction hash.

#### Request

`[message-id, [hash]]`

- `hash` Loose, of type 32 byte hash, referring to the transaction hash.

#### Response

`[message-id, [block_number, block_hash, index]]`

- `block_number` the block number of the block containing the transaction **reusable as 0**
- `block_hash` hash of the requested block **reusable as 1**
- `index` index in the block

### BlockReceipts (0x03)

Request for a block's receipts.

#### Request

`[message-id, [hash]]`

- `hash` Loose, of type 32 byte hash, referring to the block hash.

#### Response

`[message-id, [receipts]]`

- `receipts` is `[receipt1, receipt2, ...]`
- `receipt1` a receipt, as per ETH spec.

### BlockBody (0x04)

Request for a block's transactions.

#### Request

`[message-id, [hash]]`

- `hash` Loose, of type 32 byte hash, referring to the transaction hash

#### Response

`[message-id, [transactions, uncles]]`

- `transactions` is `[tx1, tx2, ...]`
- `tx1` a transaction, as per ETH spec
- `uncles` is `[header1, header2,...]`
- `header1` an uncle block header as per ETH spec

### Account (0x05)

Request for proof of specific account in the state.

#### Request

`[message-id , [block_hash, address_hash]]`

- `block_hash` Loose, of type 32 byte hash, referring to the block hash
- `address_hash` Loose, of type 32 byte hash, referring to the account address hash

#### Response

`[message-id, [cht_inclusion_proof, nonce, balance, code_hash, storage_root]]`

- `cht_inclusion_proof` is `[[node1, node2, ...], ...]`
- `node1` merkle tree node as byte array
- `nonce` the block nonce (unsigned integer)
- `balance` the account balance (unsigned integer)
- `code_hash` 32 byte hash **reusable as 0**
- `storage_root` 32 byte storage root hash **reusable as 1**

### Storage (0x06)

Request for a proof of contract storage.

#### Request

`[message-id, [block_hash, address_hash, storage_key_hash]]`

- `block_hash` Loose, of type 32 byte hash, referring to the block hash
- `address_hash` Loose, of type 32 byte hash, referring to the account address hash
- `storage_key_hash` Loose, of type 32 byte hash, referring to the storage key

#### Response

`[message-id, [cht_inclusion_proof, storage_value]]`

- `cht_inclusion_proof` is `[[node1, node2, ...], ...]`
- `node1` merkle tree node as byte array
- `storage_value` 32 byte hash **reusable as 0**

### Code (0x07)

Request for contract code.

#### Request

`[message-id, [block_hash, code_hash]]`

- `block_hash` Loose, of type 32 byte hash, identifying the block.
- `code_hash` Loose, of type 32 byte hash, identifying the code.

#### Response

`[message-id, [bytecode]]`

- `bytecode` byte array of the contract code

### Execution (0x08)

Request for Merkle proofs of a contract execution.

#### Request

`[message-id, [block_hash, from_address, call_or_create_address, gas_to_prove, gas_price, value, data]]`

- `block_hash` Loose, of type 32 byte hash, identifying the block
- `from_address` Type 32 byte hash, referring to the caller account address hash
- `call_or_create_address` 32 byte hash, call contract if address, otherwise create contract if empty
- `gas_to_prove` 32 byte unsigned integer of gas to prove
- `gas_price` 32 byte unsigned integer of gas price
- `value` 32 byte unsigned integer of value to transfer
- `data` byte array of relevant data

#### Response

`[message-id, [proof]]`

- `proof` is `[[node1, node2, ...], ...]`, the necessary execution proof
- `node1` merkle tree node as byte array

[LES specification]: ./les.md
[ETH]: ./eth.md
[Cost Table]: #cost-table
[Canonical Hash Tries]: ./les.md#canonical-hash-trie
[token-bucket rate limiter]: https://en.wikipedia.org/wiki/Token_bucket
[Status]: #status-0x00
[Request Batch]: #request-batch-0x02
[Response Batch]: #response-batch-0x03
[PIP Request/Response Messages]: #pip-requestresponse-messages
[Headers]: #headers-0x00
[Execution]: #execution-0x08
