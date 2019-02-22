Node Discovery Protocol v5
===============================

**Draft of January 2019**

Note that this specification is a work in progress and may change incompatibly
without prior notice.

### Message Serialization

This section addresses the actual serialization formats for the
messages. (**TBD: Include the various specs like Topic Discovery here)**

As described earlier, this V5 Discovery proposal differentiates the
message formats based on a knowledge of another node's Discovery
version. For example, an incoming Ping from an unknown V4 node includes
the version number, 4, allowing the V5 node to record an internal ENR
for a v4 node. This provides the opportunity to avoid the existing
forward compatibility mechanism, which involves tacking new fields onto
the end of existing message formats, and fully replace redundant fields.
This Discovery version represents a change in the message format that is
not backward compatible.

Another key difference from Discovery V4 is that here we begin to
introduce a level of abstraction above UDP. Discovery V5 should not be
restricted to UDP. In this specification *packet* and *message* are not
necessarily synonymous.

**TBD: Decide if to permit future streamed transports or not.**

However, UDP poses some challenges when it comes to avoiding
fragmentation and transmitting large messages of a lossy transport,
which are considered next.

### UDP transmission strategy

So that the message types and their exchange patterns are not tied to a
transport (eg: UDP), we should avoid introdcuing packet types that only
deal with UDP fragmentation and reliability of larger packets. In other
words, it would be best to avoid "ACK" type packets, as these become
redundant on TCP or other future transports.

`FINDNODE` needs to be able to return up to `k` ENR records, plus other
data, and `TOPICQUERY` in the form proposed in this document may also
distribute a significant list of ENRs. As per specification the maximum
size of an ENR is 300 bytes. Because `k` is typically 16 in Ethereum,
a message will be at least 4800 bytes, not including additional data such
as the header.

This will cause packet fragmentation or packet loss as it exceeds the
typical MTU of 1500 at the time of writing. We will assume a 'healthy' MTU of 1280,
conforming with v4 expectations.

With the above rationale, the proposal for a transport agnostic way of
responding with large messages is as follows:

- Potentially large response messages (eg: `TOPICQUERY` and `FINDNODE`
  responses) can be sent as *multiple messages*.
- These are complete messages with their own header.
- Individual messages in a multi-message response of length `t`, will
  have a message counter `n`, and each response message will have a
  message conveying the information that this one is `n` of `t`.
- While `n` is not (at the time of writing) necessary information, it
  may be a useful forward compatibility feature in the case that
  ordering of the response stream is important.
- The recipient of a multi-message response must expect that some
  messages will be lost over UDP. Implementations must receive with a
  timeout.
- The *conversation nonce* determines the conversation and is used on
  each message.
- The precise same message format may be used over TCP, except that
  the message may include a message "1 of 1" descriptor, include all
  data in the response stream, and rely on length information

### General Message Format

**TBD: At the time of writing general consensus seems to be around RLP.
Still waiting for serious proposals for alternatives.**

Symbols

`[ .. , .. , .. ]` means an RLP list
`a || b` means concatenation of `a` and `b`

As with v4 messages, a message is:

```text
message = message-header || message-data
```

where

```text
message-header = hash || signature || message-type
hash = keccak256(signature || message-type || message-data)
signature = sign(message-type || message-data)
```

Every message is signed by the node\'s identity key (ECDSA). The
signature is encoded as a byte array of length 65 as the concatenation
of the signature values r, s and the \'recovery id\' v. The recovery
id 'v' is out of scope for this document **TBD:** Add info and refs
about recovery id and how here the Ethereum chain id offset does not
apply.

Message-type is a single byte where the *lower 5 bits* describe the
message type, corresponding to the message formats below.

### Obfuscation

Message-type's *top 3 bits* describe the *obfuscation type*. Any
parameters to the obfuscation type are supplied ***before*** the RLP
encoded message. *This position is required* because streaming
transports like TCP will not be able to determine the length of the
message to obtain the obfuscation parameter. The obfuscation parameter
must be provided first, so the remainder of the data can be read,
decoded for length or ENR count, so the end of the transmission can be
determined. While EIP-8 allows for the parameter to be supplied *after*
the RLP data, there is no way of knowing where to find the parameter in
a stream.

So,

```text
message-data = obfuscation-parameter || rlp(message)
```

'rlp' is the RLP encoding function.

Currently, *obfuscation type* may be

`0` -- No obfuscation (also compatible with v4)

1 -- XOR with the *obfuscation parameter* *and* the public key of the
sender. (The EC recover operation is expensive enough that it should act
as a deterrent. )

2 - 7 Reserved

Examples of alternatives include:

- Have the ENR of the recipient include one or more key values (eg:
  obf1, obf2, etc), and make the *obfuscation parameter* a randomly
  selected *reference* to one of those.
- Support for a fully encrypted channel option.

### Conversation Nonce

A mandatory component of all messages is the conversation-nonce.

A *conversation* is set of message exchanges involving two or more
participants. A request-reply is a simple conversation. A request for
nodes or topics followed immediately by a WhoAreYou/IAm is an exchange
of messages that is also one conversation.

When a request is sent to a node, the signed, hashed response must
include some unique code to make sure that the requester can know that
this is not a replayed message. Another way of viewing this is that a
correlator must uniquely relate the response with the request.

This correlator can also serve the purpose of identifying which
responses correspond to which request if for some reason multiple
request/replies are happening concurrently.

More generally, the conversation nonce groups messages into a unique
conversation, allowing concurrent conversations to be separated, and
guaranteeing that replayed messages are ignored.

In future, conversations may involve multiple occurrences of a single
type of message. An eavesdropper could confuse the conversation by
replaying previous occurrences. To prevent this, a single byte in the
conversation nonce will be reserved for future message counting. The top
4 bytes are the conversation correlator.

```text
> conversation-nonce= conversation-correlator || reserved-byte
> conversation-correlator = 4-byte conversation identifier
> reserved-byte = currently ignored, reserved as a message counter for future versions
```

The value selected must

- allow for concurrent conversations (using a timestamp can result in
  parallel conversations with the same id, so this should be avoided)

- prevent replay - so using a simple counter would be fine if the
  implementation could ensure that restarts or even re-installs would
  increment the counter based on previously saved state in all
  circumstances. The easiest to implement would be a random number.

### Recipient node ID

This is a 32 byte sha256 hash of the designated public key for the
target node ('secp256k1' key in the ENR). This is used in request messages below.

### Streaming

A note on streaming transports. Implementations should not assume that this will
always be a UDP-only protocol, using fixed byte arra. Should the underlying
transport becoming a streaming one, the RLP (de)serializers should be
implemented over a stream, rather than a fixed byte array, or provide some way
of signalling to other components that the amount of data supplied needs to be
extended.

**TBD: Consider ENR sequence numbers:**

### PING

Message id: 0x01

```text
packet-data = [version, conversation-nonce, recipient-node-id, recipient-ip, recipient-port]
version = 5
conversation-nonce = 4-byte conversation identifier
recipient-node-id = 32 byte id hash
recipient-ip = 16 or 4 byte ip address of the intended recipient
recipient-port = uint16 port
```

### PONG

Message id: 0x02

```text
packet-data = [conversation-nonce,recipient-ip, recipient-port]
conversation-nonce = 4-byte conversation identifier sent in PING
recipient-ip = 16 or 4 byte ip address of the intended recipient
recipient-port = uint16 port
```

### FINDNODE

Message id: 0x03

```text
> packet-data = [conversation-nonce, recipient-node-id, k-bucket]
> conversation-nonce = 4-byte conversation identifier
> recipient-node-id = 32-byte id hash
> k-bucket = a positive scalar, the desired k-bucket with bit 1 being
>            the 'closest' bucket, up to 32
```

## NEIGHBOURS

Message id: 0x04

One or messages of the following format

```text
packet-data = [conversation-nonce, n-of-t, enrs, [ENR, ...]]
conversation-nonce = 4-byte conversation identifier
n-of-t = two bytes corresponding to n and t (eg: message 2 of 6)
ENR = see ENR specification
```

### WHOAREYOU

Message id: 0x05

```text
packet-data = [conversation-nonce, recipient-node-id]
conversation-nonce = 4-byte conversation identifier
recipient-node-id = 32-byte id hash
```

### IAM

Message id: 0x06

```text
packet-data = [conversation-nonce, ENR]
conversation-nonce = 4-byte conversation identifier obtained in WHOAREYOU
ENR = see ENR specification
```

### REQUESTTICKET

Message id: 0x07

```text
> packet-data = [conversation-nonce, recipient-node-id, topic]
> conversation-nonce = 4-byte conversation identifier
> recipient-node-id = 32-byte id hash
> topic = the rlp encoding of a UTF-8 encoded 32-character string
```

Implementation note: The least requested topics will be evicted from the
global space. This means that an attacker attempting to pollute the
global space by requesting creation of many *new* topic queues will only
result in their own topic queues being evicted. Implementers should be
cautious of the attacker attempting to promote their own queues by
requesting their own adverts.

### TICKET

Message id: 0x08

```text
packet-data = [conversation-nonce, ticket]
conversation-nonce = 4-byte conversation identifier
ticket = [source-node-id, topic, wait-until, expiration]
topic = the rlp encoding of a UTF-8 encoded 32-character string
wait-until = the earliest absolute UNIX time before the ticket can be used
expiration = the absolute UNIX time when this ticket expires
source-node-id = who requested the ticket
```

**TBD: Expiration does not really help here...**

**TBD: Consider the following :**

**The scenario is that an attacker can do the following:**

**1. Request ticket**

**2. Place Ad (bumping up waitperiod)**

**3. Repeat 1 & 2 until waitperiod is high (in case tickets expire in a
timeout after waitperiod)**

**4. Then call Request ticket multiple times or concurrently and use
those to flood the topic queue. **

**5. Optionally, the attacker can request ads (from separate nodes even)
to bump the importance of its own spam ads.**

### REGTOPIC

Message id: 0x09

```text
packet-data = [conversation-nonce, recipient-node-id, ticket]
recipient-node-id = 64-byte public key of the called node
conversation-nonce = 4-byte conversation identifier
ticket = supplied by TICKET response
```

**TBD:** If the REGTOPIC must be part of the same conversation as the
original REQUESTTICKET, then the ticket source-node-id is redundant?

### REGCONFIRMATION

Message id: 0x0A

```text
packet-data = [conversation-nonce]
```

### TOPICQUERY

Message id: 0x0B

```text
packet-data = [conversation-nonce, recipient-node-id, topic]
conversation-nonce = 4-byte conversation identifier
topic = the rlp encoding of a UTF-8 encoded 32-character string
```

**N.B.:** One of the aims of **1.1.2** is to make it *expensive* to
correlate IDs with an IP address. By having nodes return ENRs directly,
it might appear as though it would be easy to search for advertising
nodes and simply query as many as possible for their node records. \*\*
Some arguments against that are that

- Not all nodes will advertise -- mobile clients and light clients
  whose usage will be much more to do with end-user application
  scenarios, and most desirable as a target for correlation with user
  metadata, will not advertise.
- The task of finding random advertising nodes and scraping their
  results is itself non-trivial and cannot easily be used to target a
  specific IP address.
- The topic queues at each advertising node are limited in length and
  the TOPICQUERY response (TOPICNODES) may be yet further limited \*\*

### TOPICNODES

Message id: 0x0C

```text
packet-data = [conversation-nonce, n-of-t,  [ENR, ...]]
conversation-nonce = 4-byte conversation identifier
n-of-t = two bytes corresponding to n and t (eg: message 2 of 6)
ENR = see ENR specification
```

### ENR Format

For the current ENR spec, please see [[https://eips.ethereum.org/EIPS/eip-778]](https://eips.ethereum.org/EIPS/eip-778)

According to the proposals in this document, this would need to be
extended to include some information that the ENR is an encapsulation of
unsigned v4 tuples, for temporary interoperability with the existing
network.

This can be achieved by including a *v4* true/false/empty key-value.
