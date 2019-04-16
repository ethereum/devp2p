# Parity Light Protocol (PIP)

The Parity Light Protocol is a variation of LES designed and implemented by Parity Tech for the Parity Ethereum client.

Please refer to the LES specification for information on the purpose of light clients and protocols.

PIP adopts a flow-control mechanism closely analogous to a [token-bucket rate limiter](https://en.wikipedia.org/wiki/Token_bucket) where the client is expected to mirror the server token-bucket state (as exceeding the 'burstiness' depth is a violation that results in disconnection). This is also explained in more detail in the [LES] documentation.

PIP utilises [Canonical Hash Tries] (CHTs), which are also described in the [LES] documentation.

Unlike LES, a PIP CHT is generated once every 2048 blocks. One 32-byte trie root is stored for every range of 2048 blocks.

The current version is **pip/1**.

The original proposal and some information on design rationale is at [Parity Light Protocol]

## Symbols

Throughout this document, and in accordance with other devp2p documents, when referring to wire message formats the following symbols apply:

`[ .. , .. , .. ]` means an RLP list

`a || b` means concatenation of `a` and `b`

`...` means additional list elements

## Handshake

After the initial RLPx handshake, the first message that must be communicated is from the server to the light peer and is a status message. Updates to information in the status message are supplied with announcements.

### Status

`message-id: 0x00`

```text
message-data = message-id || [[key0,value0],[key1,value1],...]
```

Keys are strings.

Mandatory keys and values are as follows:

```text
[“protocolVersion”, protocol_version]
[“networkId”, network_id]
["headTd", total_difficulty]
[“headHash”,  head_blockhash]
[“headNum”, head_blocknum]
[“genesisHash”, genesis_hash]

protocol_version= 1 for this PIP/1 protocol version.
network_id =  0 for testnet, 1 for mainnet
total_difficulty = integer total difficulty of the best chain as found in the block header.
head_blockhash =  the hash of the best (i.e. highest total difficulty) known block.
head_blocknum = the number of the best (i.e. highest total difficulty) known block.
genesisHash = the hash of the genesis block.
```

Optional keys and values are as follows:

```text
["serveHeaders", serve_headers]
["serveChainSince", serve_chain_since]
["serveStateSince", serve_state_since]
["txRelay”,  tx_relay]
["flowControl/BL", flow_control_bl]
["flowControl/MRC", flow_control_mrc]
["flowControl/MRR", flow_control_mrr]

serve_headers = any value and key-pair present if the peer can serve header chain downloads.
serve_chain_since = present if the peer can serve Body/Receipts ODR requests starting from the given block number.
serve_state_since = present if the peer can serve Proof/Code ODR requests starting from the given block number.
tx_relay =  present if the peer can relay transactions to the network.
flow_control_bl = max credits (positive integer describing the burst-depth of the token bucket),
flow_control_mrc = cost_table (see below)
flow_control_mrr = rate of recharge (positive integer of credits recharged per second)
```

#### Cost table

The cost table includes a mapping of individual [PIP message request IDs](#PIP-messages) to costs, which are applied in the token-bucket rate limiter. The [Headers](#headers) and [Execution](#execution) request messages are special cases where the cost is multiplied by the maximum number of requested header or gas requested, respectively. The table also includes a base cost, which is applied to the [request batch message](#request-message).

```text
cost_table = [base_cost, [id,cost],...]

base_cost = positive integer cost applied to a request batch.
id = identifier of an individual PIP message type
cost = positive integer to apply to cost calculations for this message type
```

### Announcement

`message-id: 0x01`

```text
message-data = message-id || [head_blockhash, head_blocknum, total_difficulty, reorg_depth, [key0,value0],[key1,value1],...]

reorg_depth: positive integer containing the reorganization depth to the common ancestor of the new head and the last announced head.
```

The message element meanings are the same as in the [Status](#Status) with the exception of reorg_depth.

## PIP Requests and Responses

PIP request and response messages are batched and cannot be sent individually. Unlike LES, PIP batches may contain messages of different types.

PIP tries to further optimise client-server round trips by allowing the individual requests in the batch to include references to what their responses would contain if processed sequentially. For clarification, an exampple PIP batch request could contain two request messages in order, where the second message specifies that an input is a specific 'output' of the first message, where 'output' means the server response to that request.

### Request message (0x02)

`message-id: 0x02`

```text
message-data = message-id || [request-id, [req1, ...]]

request-id = a unique scalar request identifier for request-reply correlation
[req1, ...] = an rlp list of requests, each request being the rlp encoding of a request as specified below
```

### Response message (0x03)

`message-id: 0x03`

```text
message-data = message-id || [request-id, cr, [resp1, ...]]

request-id = the unique scalar correlating with a previously received request message 
cr = an updated amount of request credits prior to recharge events at the time of processing on the server (please see throttling below)
[resp1, ...] = an rlp list of response messages, each request being the rlp encoding of a response as specified below
```

The individual responses must supply all elements of the response message specifications. The PIP protocol considers messages missing any of these elements _incomplete_.

## Flow Control Announcements

The server may periodically update the token-bucket parameters, such as depth, message cost and recharge rate, for the particular client.

These updates are sent to clients as `UpdateCreditParameters` messages. Received updates must be acknowledged with an `AcknowledgeUpdate` message.

### UpdateCreditParameters

`message-id: 0x04`

```text
message-id || [max, recharge, cost_table]

max = positive integer, the new maximum credit depth for the token bucket
recharge = positive integer, the new recharge rate in credits per second
cost_table = the new message cost parameters
```

The cost_table is explained in more detail [here](#cost-table)

### AcknowledgeUpdate

`message-id: 0x05`

```text
message-id

This message has no payload.
```

## Transaction Relay

Standard Ethereum transactions may be sent by a light client to the server for relay to the network.

### RelayTransactions

`message-id: 0x06`

```text
message-id || [tx1, tx2, ...]

tx1, tx2 = RLP encoded transactions as per ETH documentation
```

## PIP Messages

The [PIP request message batch](#request-message) contains individual messages of the types described below.

Each type specifies its corresponding response message (referred to as _outputs_ in the [original rationale][Parity Light Protocol]).

As described in the batch message details, each individual request message in a batch may specify that an input field should be populated with a field from the future response message of a request earlier in the batch.

Referencing a field in a response to a batched request is achieved with  _loose inputs_ and _reusable outputs_. Response message fields are documented as being _reusable(n)_ where _n_ is an identifier labelling the field in the response message body.

_Loose inputs_ may be a back-reference to a _reusable output_ or may be hard data.

### Loose Input (data type)

```text
loose_input = [raw_flag, input]

raw_flag = (aka 'discriminant') 0 or 1 , where 0 means input should be raw data, 1 means input should be a reference to a reusable output
input = if raw_flag is 0, this is the RLP encoded value
        if raw_flag is 1, this is back_reference
back_reference = [request_message_index, reusable_output]
request_message_index = the 0-based position of a prior message in the request batch
reusable_output = the unsigned integer identifying the corresponding response message field
```

The following are the individual messages, paired as requests and their responses.

### Headers (0x00)

Request and retrieve block headers from the server.

#### Request

`message-id: 0x00`

```text
[message-id , [start, skip, max, reverse]]

start = Loose, of type either 32byte hash (block hash), or unsigned integer block number
skip = unsigned integer N, specifying the server should return every Nth block
max = unsinged integer, the maximum number of blocks to return
reverse = 0 if the block numbers should be increasing, 1 to return in reverse order
```

#### Response

```text
[message-id ,[header1, header2, ...]]

header1, header2, ... = the rlp encoded headers
```

### HeaderProof (0x01)

Request for a header proof.

#### Request

`message-id: 0x01`

```text
[message-id, [block]]

block = Loose, of type unsigned integer, referring to the block number
```

#### Response

```text
[message-id, [cht_inclusion_proof, block_hash, total_difficulty]]

cht_inclusion_proof = [[node1, node2, ...], ...]
node1 = merkle tree node as byte array
block_hash = hash of the requested block ***reusable as 0***
total_difficulty = unsigned integer, the requested block total difficulty
```

### TransactionIndex (0x02)

Request for a transaction index based on hash.

#### Request

`message-id: 0x02`

```text
[message-id , [hash]]

hash = Loose, of type 32 byte hash, referring to the transaction hash
```

#### Response

```text
[message-id, [block_number, block_hash, index]]

block_number = the block number of the block containing the transaction ***reusable as 0***
block_hash = hash of the requested block ***reusable as 1***
index = index in the block
```

### BlockReceipts (0x03)

Request for a block's receipts.

#### Request

`message-id: 0x03`

```text
[message-id , [hash]]

hash = Loose, of type 32 byte hash, referring to the transaction hash
```

#### Response

```text
[message-id, [receipts]]

receipts = [receipt1, receipt2, ...]
receipt1 = an rlp encoded receipt, as per ETH spec
```

### BlockBody (0x04)

Request for a block's transactions.

#### Request

`message-id: 0x04`

```text
[message-id , [hash]]

hash = Loose, of type 32 byte hash, referring to the transaction hash
```

#### Response

```text
[message-id, [transactions,uncles]]

transactions = [tx1, tx2, ...]
tx1 = an rlp encoded transaction, as per ETH spec
uncles = [header1,header2,...]
header1 = an rlp encoded uncle block header as per ETH spec
```

### Account (0x05)

Request for proof of specific account in the state.

#### Request

`message-id: 0x05`

```text
[message-id , [block_hash, address_hash]]

block_hash = Loose, of type 32 byte hash, referring to the block hash
address_hash = Loose, of type 32 byte hash, referring to the account address hash
```

#### Response

```text
[message-id, [cht_inclusion_proof,nonce, balance, code_hash, storage_root]]

cht_inclusion_proof = [[node1, node2, ...], ...]
node1 = merkle tree node as byte array
nonce = the block nonce (unsigned integer)
balance = the account balance (unsigned integer)
code_hash = 32 byte hash ***reusable as 0***
storage_root = 32 byte storage root hash ***reusable as 1***
```

### Storage (0x06)

Request for a proof of contract storage.

#### Request

`message-id: 0x06`

```text
[message-id , [block_hash, address_hash, storage_key_hash]]

block_hash = Loose, of type 32 byte hash, referring to the block hash
address_hash = Loose, of type 32 byte hash, referring to the account address hash
storage_key_hash = Loose, of type 32 byte hash, referring to the storage key
```

#### Response

```text
[message-id, [cht_inclusion_proof, storage_value]]

cht_inclusion_proof = [[node1, node2, ...], ...]
node1 = merkle tree node as byte array
storage_value = 32 byte hash ***reusable as 0***

```

### Code (0x07)

Request for a contract code

#### Request

`message-id: 0x07`

```text
[message-id , [block_hash, code_hash]]

block_hash = Loose, of type 32 byte hash, indentifying the block 
code_hash = Loose, of type 32 byte hash, identifying the code
```

#### Response

```text
[message-id, [bytecode]]

bytecode = rlp byte array of the bytecode
```

### Execution (0x08)

Request for Merkle proofs of a contract execution.

`message-id: 0x08`

#### Request

```text

message-data = [message-id , [block_hash, from_address, call_or_create_address,gas_to_prove, gas_price, value, data]]

block_hash = Loose, of type 32 byte hash, identifying the block 
from_address =  Type 32 byte hash, referring to the caller account address hash
call_or_create_address = 32 byte hash, call contract if address, otherwise create contract if empty
gas_to_prove = 32 byte unsigned integer of gas to prove
gas_price = 32 byte unsigned integer of gas price
value = 32 byte unsigned integer of value to transfer
data = byte array of relevant data 
```


#### Response

```text
[message-id, [proof]]

proof = [[node1, node2, ...], ...] the necessary execution proof
node1 = merkle tree node as byte array
```

[LES]: ./les.md
[Parity Light Protocol]: https://wiki.parity.io/The-Parity-Light-Protocol-(PIP)
[Canonical Hash Tries]: ./les.md#canonical-hash-tries