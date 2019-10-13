# Node Discovery Protocol

This specification defines the Node Discovery protocol version 4, a Kademlia-like DHT that
stores information about Ethereum nodes. The Kademlia structure was chosen because it is
an efficient way to organize a distributed index of nodes and yields a topology of low
diameter.

The current protocol version is **4**. You can find a list of changes in past protocol
versions at the end of this document.

## Node Identities

Every node has a cryptographic identity, a key on the secp256k1 elliptic curve. The public
key of the node serves as its identifier or 'node ID'.

The 'distance' between two node keys is the bitwise exclusive or on the hashes of the
public keys, taken as the number.

    distance(n₁, n₂) = keccak256(n₁) XOR keccak256(n₂)

## Node Records

Participants in the Discovery Protocol are expected to maintain a [node record] \(ENR\)
containing up-to-date information. All records must use the "v4" identity scheme. Other
nodes may request the local record at any time by sending an [ENRRequest] packet.

To resolve the current record of any node public key, perform a Kademlia lookup using
[FindNode] packets. When the node is found, send ENRRequest to it and return the record
from the response.

## Kademlia Table

Nodes in the Discovery Protocol keep information about other nodes in their neighborhood.
Neighbor nodes are stored in a routing table consisting of 'k-buckets'. For each `0 ≤ i <
256`, every node keeps a k-bucket for nodes of distance between `2i` and `2i+1` from
itself.

The Node Discovery Protocol uses `k = 16`, i.e. every k-bucket contains up to 16 node
entries. The entries are sorted by time last seen — least-recently seen node at the head,
most-recently seen at the tail.

Whenever a new node N₁ is encountered, it can be inserted into the corresponding bucket.
If the bucket contains less than `k` entries N₁ can simply be added as the first entry. If
the bucket already contains `k` entries, the least recently seen node in the bucket, N₂,
needs to be revalidated by sending a [Ping] packet. If no reply is received from N₂ it is
considered dead, removed and N₁ added to the front of the bucket.

## Endpoint Proof

To prevent traffic amplification attacks, implementations must verify that the sender of a
query participates in the discovery protocol. The sender of a packet is considered
verified if it has sent a valid [Pong] response with matching ping hash within the last 12
hours.

## Recursive Lookup

A 'lookup' locates the `k` closest nodes to a node ID.

The lookup initiator starts by picking `α` closest nodes to the target it knows of. The
initiator then sends concurrent [FindNode] packets to those nodes. `α` is a system-wide
concurrency parameter, such as 3. In the recursive step, the initiator resends FindNode to
nodes it has learned about from previous queries. Of the `k` nodes the initiator has heard
of closest to the target, it picks `α` that it has not yet queried and resends [FindNode]
to them. Nodes that fail to respond quickly are removed from consideration until and
unless they do respond.

If a round of FindNode queries fails to return a node any closer than the closest already
seen, the initiator resends the find node to all of the `k` closest nodes it has not
already queried. The lookup terminates when the initiator has queried and gotten responses
from the `k` closest nodes it has seen.

## Wire Protocol

Node discovery messages are sent as UDP datagrams. The maximum size of any packet is 1280
bytes.

    packet = packet-header || packet-data

Every packet starts with a header:

    packet-header = hash || signature || packet-type
    hash = keccak256(signature || packet-type || packet-data)
    signature = sign(packet-type || packet-data)

The `hash` exists to make the packet format recognizable when running multiple protocols
on the same UDP port. It serves no other purpose.

Every packet is signed by the node's identity key. The `signature` is encoded as a byte
array of length 65 as the concatenation of the signature values `r`, `s` and the 'recovery
id' `v`.

The `packet-type` is a single byte defining the type of message. Valid packet types are
listed below. Data after the header is specific to the packet type and is encoded as an
RLP list. Implementations should ignore any additional elements in the `packet-data` list
as well as any extra data after the list.

### Ping Packet (0x01)

    packet-data = [version, from, to, expiration, enr-seq ...]
    version = 4
    from = [sender-ip, sender-udp-port, sender-tcp-port]
    to = [recipient-ip, recipient-udp-port, 0]

The `expiration` field is an absolute UNIX time stamp. Packets containing a time stamp
that lies in the past are expired may not be processed.

The `enr-seq` field is the current ENR sequence number of the sender. This field is
optional.

When a ping packet is received, the recipient should reply with a [Pong] packet. It may
also consider the sender for addition into the local table. Implementations should ignore
any mismatches in version.

If no communication with the sender has occurred within the last 12h, a ping should be
sent in addition to pong in order to receive an endpoint proof.

### Pong Packet (0x02)

    packet-data = [to, ping-hash, expiration, enr-seq, ...]

Pong is the reply to ping.

`ping-hash` should be equal to `hash` of the corresponding ping packet. Implementations
should ignore unsolicited pong packets that do not contain the hash of the most recent
ping packet.

The `enr-seq` field is the current ENR sequence number of the sender. This field is
optional.

### FindNode Packet (0x03)

    packet-data = [target, expiration, ...]

A FindNode packet requests information about nodes close to `target`. The `target` is a
65-byte secp256k1 public key. When FindNode is received, the recipient should reply with
[Neighbors] packets containing the closest 16 nodes to target found in its local table.

To guard against traffic amplification attacks, Neighbors replies should only be sent if
the sender of FindNode has been verified by the endpoint proof procedure.

### Neighbors Packet (0x04)

    packet-data = [nodes, expiration, ...]
    nodes = [[ip, udp-port, tcp-port, node-id], ...]

Neighbors is the reply to [FindNode].

### ENRRequest Packet (0x05)

    packet-data = [expiration]

When a packet of this type is received, the node should reply with an ENRResponse packet
containing the current version of its [node record].

To guard against amplification attacks, the sender of ENRRequest should have replied to a
ping packet recently (just like for FindNode). The `expiration` field, a UNIX timestamp,
should be handled as for all other existing packets i.e. no reply should be sent if it
refers to a time in the past.

### ENRResponse Packet (0x06)

    packet-data = [request-hash, ENR]

This packet is the response to ENRRequest.

- `request-hash` is the hash of the entire ENRRequest packet being replied to.
- `ENR` is the node record.

The recipient of the packet should verify that the node record is signed by the public key
which signed the response packet.

# Change Log

## Known Issues in the Current Version

The `expiration` field present in all packets is supposed to prevent packet replay. Since
it is an absolute time stamp, the node's clock must be accurate to verify it correctly.
Since the protocol's launch in 2016 we have received countless reports about connectivity
issues related to the user's clock being wrong.

The endpoint proof is imprecise because the sender of FindNode can never be sure whether
the recipient has seen a recent enough pong. Geth handles it as follows: If no
communication with the recipient has occurred within the last 12h, initiate the procedure
by sending a ping. Wait for a ping from the other side, reply to it and then send
FindNode.

## EIP-868 (October 2019)

[EIP-868] adds the [ENRRequest] and [ENRResponse] packets. It also modifies [Ping] and
[Pong] to include the local ENR sequence number.

## EIP-8 (December 2017)

[EIP-8] mandated that implementations ignore mismatches in Ping version and any additional
list elements in `packet-data`.

[Ping]: #ping-packet-0x01
[Pong]: #pong-packet-0x02
[FindNode]: #findnode-packet-0x03
[Neighbors]: #neighbors-packet-0x04
[ENRRequest]: #enrrequest-packet-0x05
[ENRResponse]: #enrresponse-packet-0x06
[EIP-8]: https://eips.ethereum.org/EIPS/eip-8
[EIP-868]: https://eips.ethereum.org/EIPS/eip-868
[node record]: ./enr.md
