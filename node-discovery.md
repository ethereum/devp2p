# Node Discovery Protocol

**Node**: an entity on the network  
**Node ID**: 512 bit public key of node

The Node Discovery protocol provides a way to find RLPx nodes
that can be connected to. It uses a Kademlia-like protocol to maintain a
distributed database of the IDs and endpoints of all listening nodes.

Each node keeps a node table as described in the Kademlia paper
[[Maymounkov, Mazières 2002][kad-paper]]. The node table is configured
with a bucket size of 16 (denoted `k` in Kademlia), concurrency of 3
(denoted `α` in Kademlia), and 8 bits per hop (denoted `b` in
Kademlia) for routing. The eviction check interval is 75 milliseconds,
and the idle bucket-refresh interval is
3600 seconds.

In order to maintain a well-formed network, RLPx nodes should try to connect
to an unspecified number of close nodes. To increase resilience against Sybil attacks,
nodes should also connect to randomly chosen, non-close nodes.

Each node runs the UDP-based RPC protocol defined below. The
`FIND_DATA` and `STORE` requests from the Kademlia paper are not part
of the protocol since the Node Discovery Protocol does not provide DHT
functionality.

[kad-paper]: http://www.cs.rice.edu/Conferences/IPTPS02/109.pdf

## Joining the network

When joining the network, fills its node table by perfoming a
recursive Find Node operation with its own ID as the `Target`. The
initial Find Node request is sent to one or more bootstrap nodes.

## RPC Protocol

RLPx nodes that want to accept incoming connections should listen on
the same port number for UDP packets (Node Discovery Protocol) and
TCP connections (RLPx protocol).

All requests time out after are 300ms. Requests are not re-sent.

UDP packets are structured as follows:

Offset  |||
------: | ----------| -------------------------------------------------------------------------
0       | signature | Ensures authenticity of sender, `SIGN(sender-privkey, MDC)`
65      | MDC       | Ensures integrity of packet, `SHA3(sender-pubkey || type || data)`
97      | type      | Single byte in range [1, 4] that determines the structure of Packet Data
98      | data      | RLP encoded, see section Packet Data

The packets are signed and authenticated. The sender's Node ID is determined by
recovering the public key from the signature.

    sender-pubkey = ECRECOVER(Signature)

The integrity of the packet can then be verified by computing the
expected MDC of the packet as:

    MDC = SHA3(sender-pubkey || type || data)

As an optimization, implementations may look up the public key by
the UDP sending address and compute MDC before recovering the sender ID.
If the MDC values do not match, the packet can be dropped.

## Packet Data

All packets contain an `Expiration` date to guard against replay attacks.
The date should be interpreted as a UNIX timestamp.
The receiver should discard any packet whose `Expiration` value is in the past.

### Ping (type 0x01)

Ping packets can be sent and received at any time. The receiver should
reply with a Pong packet and update the IP/Port of the sender in its
node table.

RLP encoding: **[** `IP`, `Port`, `Expiration` **]**

Element   ||
----------|------------------------------------------------------------
`IP`      | (length 4 or 16) IP address on which the node is listening
`Port`    | listening port of the node

### Pong (type 0x02)

Pong is the reply to a Ping packet.

RLP encoding: **[** `Reply Token`, `Expiration` **]**

Element       ||
--------------|-----------------------------------------------
`Reply Token` | content of the MDC element of the Ping packet

### Find Node (type 0x03)

Find Node packets are sent to locate nodes close to a given target ID.
The receiver should reply with a Neighbors packet containing the `k`
nodes closest to target that it knows about.

RLP encoding: **[** `Target`, `Expiration` **]**

Element  ||
---------|--------------------
`Target` | is the target ID

### Neighbors (type 0x04)

Neighbors is the reply to Find Node. It contains up to `k` nodes that
the sender knows which are closest to the requested `Target`.

RLP encoding: **[ [** `Node₁`, `Node₂`, ..., `Nodeₙ` **]**, `Expiration` **]**  
Each `Node` is a list of the form **[** `Version`, `IP`, `Port`, `ID` **]**

Element   ||
----------|---------------------------------------------------------------
`ID`      | The advertised node's public key
`Version` | the RLPx protocol version that the node implements
`IP`      | (length 4 or 16) IP address on which the node is listening
`Port`    | listening port of the node
