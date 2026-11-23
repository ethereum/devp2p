# Browser Transaction Submission Protocol (webtx)

`webtx` is a protocol runs on browser connections of the [QUIC] transport that allows
browsers to submit signed transactions directly to an Ethereum node. The current protocol
version is **webtx/1**.

## Transaction submission

Today, browsers have no way to submit a transaction into the execution layer network
except by using a JSON-RPC provider. `webtx` is the protocol which uses WebTransport to
allow browsers to connect to nodes.

For now a session is expected to proceed as below:

1. The browser sends a [TxSubmit] message containing one or more transactions.
2. The node adds the transactions to its local pool and replies with [TxResult].
3. The connection is closed.

Transactions accepted into the pool are relayed to other peers using the regular
transaction exchange mechanism of the [eth] protocol.

## Session Lifecycle

After the capability exchange, the browser must send a [TxSubmit] message within 10
seconds. If there is no message arrives in this time period, the node can close the
connection.

After processing the submission, the node sends [TxResult] and terminates the session. The
termination follows the procedure described in [QUIC] transport, which ensures the result
actually reaches the browser before the session is closed.

browser terminates session

## Transaction Validation

Submitted transactions use the encoding described in [Transaction Encoding and Validity]
of the `eth` protocol.

Blob transactions (type 3) are not supported in `webtx/1`. When the node receives a blob
transaction, it must report it with the `InvalidTx` result code.

The node validates every transaction the same way it would validate a transaction received
from an `eth` peer, and adds it to its local pool if valid. The outcome is reported back
to the browser as a result code for each transaction. Implementations should map their
internal errors to these codes as closely as possible.

| Code | Name              | Meaning                                                      |
|------|-------------------|--------------------------------------------------------------|
| 0    | OK                | Transaction was accepted into the pool.                      |
| 1    | AlreadyKnown      | Transaction is already in the pool.                          |
| 2    | InvalidNonce      | Nonce is too low or too high.                                |
| 3    | InvalidFee        | Fee fields are invalid, or the replacement is underpriced.   |
| 4    | GasPriceTooLow    | Tip is below the minimum accepted by the node.               |
| 5    | InsufficientFunds | Sender balance does not cover value and fees.                |
| 6    | InvalidGasLimit   | Gas limit is too low (e.g. below intrinsic gas) or too high. |
| 7    | PoolError         | Rejected due to the local pool state.                        |
| 8    | InvalidTx         | Any other error.                                             |

Implementations may penalize browsers that submit invalid transactions (i.e. any result
other than OK or PoolError), for example by refusing their connections for some time.

## Protocol Messages

### TxSubmit (0x00)

`[tx₁, tx₂, ...]`

This message submits transactions to the node.

- `txₙ`: Transaction in the format described in [Transaction Encoding and Validity]

Since anyone can open a browser connection, nodes must protect themselves against
excessive submissions.

The list must contain at least one and at most 16 transactions. The size limit for the
TxSubmit message is 256 KiB. Breaking either limit must be considered as a protocol
violation.

### TxResult (0x01)

`[result₁: P, result₂: P, ...]`

This message reports the outcome of a [TxSubmit] message. The response contains one entry
for each submitted transaction, in the same order as the transactions appeared in
[TxSubmit]. Each entry is a result code (see [Transaction Validation]).

## Change Log

### webtx/1 (November 2026)

Version 1 was the introduction of the browser transaction submission protocol.


[TxSubmit]: #txsubmit-0x00
[TxResult]: #txresult-0x01 
[Transaction Validation]: #transaction-validation 
[QUIC]: ../quic.md
[eth]: ./eth.md 
[Transaction Encoding and Validity]: ./eth.md#transaction-encoding-and-validity
