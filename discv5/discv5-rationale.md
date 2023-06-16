# Node Discovery Protocol v5 - Rationale

**Protocol version v5.2**

Note that this specification is a work in progress and may change incompatibly without
prior notice.

This document explains the design requirements and security needs of Discovery v5. In
addition, the document tries to gather the various vulnerabilities and threats that
pertain to Kademlia-like p2p networks. Our aim is to make it plain which issues are
addressed and how they are mitigated, so that the design of the [wire protocol] may be
verified.

# Design Requirements

## Basic Goals

#### 1.1.1 Replace the Discovery v4 Endpoint Proof

The existing mutual endpoint verification process is unreliable because either side may
forget about a previously performed endpoint proof. If node A assumes that node B already
knows about a recent PING/PONG interaction and sends FINDNODE, the request may fail.
Implementations of Discovery v4 may guard against this flaw using retries, but retrying is
really slow and usually not done.

#### 1.1.2 Require knowledge of destination node ID for communication

Make it expensive to obtain the logical node ID from discovery communications. In
Discovery v4, any node can provoke responses knowing IP alone, and obtain information
about a node without knowing its ID. This encourages sloppy implementations to not perform
proper validation of FINDNODE results and increases the risk of DHT misuse for DDoS
purposes.

#### 1.1.3 Support more than one node ID cryptosystem

Ensure the DHT can accomodate ENR's with multiple identity systems. This will allow
identity cryptosystems other than *secp256k1/keccak256*.

#### 1.1.4 Replace node information tuples with ENRs

ENRs include discovery information and more. These signed, versioned records fulfill
multiple requirements, such as permitting capability advertisement and transport
negotiation.

#### 1.1.5 Guard against Kademlia implementation flaws

Discovery v4 trusts other nodes to return neighbors according to an agreed distance
metric. Mismatches in implementation can make it hard for nodes to join the network, or
lead to network fragmentation.

#### 1.1.6 Secondary topic-based node index

The protocol must support discovery of nodes via an arbitrary topic identifier. Finding
nodes belonging to a topic should be as fast or faster than finding a node with a certain
ID.

#### 1.1.7 Change replay prevention

The use of timestamps as a replay prevention mechanism in Discovery v4 has led to many
complaints about connectivity when the host's clock was wrong. The protocol should be
independent of the clock.

#### 1.1.8 Message obfuscation

The protocol should obfuscate traffic to prevent accidental packet mangling or trivial
sniffing. It must also avoid inclusion of obvious markers to prevent naive blocking of
discovery traffic using hard-coded packet signatures. Defense against advanced traffic
analysis systems, e.g. using inter-packet timing is a secondary concern.

## Security Goals

Individual potential vulnerabilities are identified below. These each represent their own
risk mitigation goal.

#### 1.2.1 Replay of the handshake

The handshake, if successfully replayed from an older session, would allow a malicious
node to occupy a former IP location, or pollute the routing table with old information.

#### 1.2.2 Replay NODES

A NODES response, if successfully replayed, would pollute the routing table with stale
information.

#### 1.2.3 Replay PONG

A PONG, if successfully replayed, could convince a node that a node is live and
participating when it isn't.

#### 1.2.4 Kademlia redirection

A FindNode response contains false endpoint information intended at directing traffic at a
victim / polluting the routing table. A topic query results in fake endpoint information,
directing traffic at a victim.

#### 1.2.5 Kademlia redirection + self-propagation

As 1.2.3 but the responses attempt to replicate the malicious node throughout the routing
table, to amplify the source of pollution and traffic.

#### 1.2.6 Unsolicited replies

A malicious node is attempting to spam a node with fake responses to typical requests.
These messages may be replayed from previous communications, or may be new messages with
spoofed source endpoints. The aim is to disrupt weak implementations or have their
information be received as authentic, to pollute the recipient's routing table.

#### 1.2.7 Amplification

Malicious requests of small message size are sent from spoofed source IPs to direct larger
response messages at the victim.

#### 1.2.8 Kademlia direct validation

Direct validation of a newly discovered node can be an attack vector. A malicious node may
supply false node information with the IP of a victim. Validation traffic is then directed
at the victim.

#### 1.2.9 Kademlia ID count per address validations

There are various attacks facilitated by being able to associate multiple fake (or even
real) malicious node ids with a single IP endpoint. One mitigation method that is
sometimes considered is to globally limit the number of logical node IDs that can be
associated with an IP address. However, this is an attack vector. A malicious actor can
supply many logical node ids for a single IP address and thus prevent the correct node
from being able to join the network.

#### 1.2.10 Sybil/Eclipse attacks

These attacks rely on being able to create many real nodes, or spoof many logical node IDs
for a small number of physical endpoints, to form a large, isolated area of the network
under the control of the malicious actor. The victim's discovery findings are directed
into that part of the network, either to manipulate their traffic or to fully isolate them
from the network.

## Version Interoperability / Upgrade Paths

There are several considerations regarding the coexistence of v4 and v5 network members.

#### 1.3.1 Transition period during network formation

Discovery v4 clients should be able to serve as discovery v5 bootstrap nodes while the
number of new discovery v5 clients is still low.

#### 1.3.2 Circumvention of 1.1.2 with v4 PING

While a client supports both the old v4 and newer versions, it is possible for malicious
actors to pose as a v4 node and recover node IDs from arbitrary IP addresses. This should
somehow be avoided.

# Rationale

## Why UDP?

The wire protocol specification mandates the use of UDP. This may seem restrictive, but
use of UDP communication is an important part of the design. While there is no single
reason which ultimately dictates this choice, there are many reasons why the system as a
whole will function a lot better in the context of UDP.

For discovery to work, all nodes must be able to communicate with each other on equal
footing. The network won't form properly if some nodes can only communicate with certain
other nodes. Incooperative NAT in between the node and the Internet can cause
communication failure. UDP is fundamentally easier to work with when it comes to NAT
traversal. No explicit hole-punching is required if the NAT setup is capable of full-cone
translation, i.e. a single packet sent to any other node establishes a port mapping which
allows packets from others to reach the node behind NAT.

Unlike other DHT systems such as IPFS, the node discovery protocol mandates a single wire
protocol to be implemented by everyone. This avoids communication failures due to
incompatible transports and strengthens the DHT because all participants are guaranteed to
be reachable on the declared endpoint. It is also fundamentally simpler to reason about
and implement: the protocol either works in a certain context or it doesn't. If the
protocol cannot be used because the networking environment doesn't support UDP, another
discovery mechanism must be chosen.

Another reason for UDP is communication latency: participants in the discovery protocol
must be able to communicate with a large number of other nodes within a short time frame
to establish and maintain the neighbor set and must perform regular liveness checks on
their neighbors.

These protocol interactions are difficult to implement in a TCP setting where connections
require multiple round-trips before application data can be sent and the connection
lifecycle needs to be maintained. An implementation of the wire protocol on a TCP-based
transport would either need permanent connection to hundreds of nodes, in which case the
application would be short on file descriptors, or establish many short-lived TCP
connections per second to communicate with specific nodes.

Yet another useful property of UDP is that packets aren't required to reach their
destination --- intermediaries may drop arbitrary packets. This strengthens the protocol
because it must be designed to function even under bad connectivity. Implementations may
exploit the possibility of packet loss to their advantage. A participant can never tell
whether a certain request wasn't answered in time because the recipient chose to ignore it
or because their own connection isn't working. An implementation that tries to minimize
traffic or CPU overhead could simply drop a certain amount of packets at application level
to stay within self-imposed limits.

## Why Kademlia?

Kademlia is a simple distributed hash table design proposed in 2002. It is commonly used
for file-sharing systems where content is stored by hash and distributed among
participants based on their 'proximity' according to the XOR distance metric.

Node discovery is a Kademlia-inspired system but doesn't store any files, only node
information is relayed. We chose Kademlia primarily because the algorithm is simple and
understandable while providing a distributed database that scales with the number of
participants. Our system also relies on the routing table to allow enumeration and random
traversal of the whole network, i.e. all participants can be found. Most importantly,
having a structured network with routing enables thinking about DHT 'address space' and
'regions of address space'.

Kademlia is often criticized as a naive design with obvious weaknesses. We believe that
most issues with simple Kademlia can be overcome by careful programming and the benefits
of a simple design outweigh the cost and risks of maintaining a more complex system.

## Sybil and Eclipse Attacks

The well-known 'sybil attack' is based on the observation that creating node identities is
essentially free. In any system using a measure of proximity among node identities, an
adversary may place nodes close to a chosen node by generating suitable identities. For
basic node discovery through network enumeration, the 'sybil attack' poses no significant
challenge.

An 'eclipse attack' is usually based on generating sybil nodes with the goal of polluting
the victim node's routing table. Once the table is overtaken, the victim has no way to
find any other nodes but those controlled by the adversary. Even if creating sybil nodes
were somehow impossible, 'eclipsing' a node might still be achieved through other means
such as directing large amounts of traffic to the node. When the victim node is unable to
keep up regular communication with the rest of the network it may lose connection and be
forced into re-bootstrapping its routing table --- a situation in which it is most
vulnerable.

Both the 'sybil attack' and the 'eclipse attack' must be considered for any structured
overlay network, and there is no single optimal solution to fully protect against these
attacks. However, certain implementation decisions can make them more expensive or render
them ineffective.

As a general measure, implementations can place IP-based limits on the content of their
routing table. For example, limiting Kademlia table buckets to two nodes from every /24 IP
subnetwork and the whole table to 10 nodes per /24 IP subnetwork significantly increases
the number of hosts an attacker must control to overtake the routing table. Such limits
are effective because IPv4 addresses are a scarce resource. Subnetwork-based limits remain
effective even as IPv6 adoption progresses.

To counter being eclipsed via repeated contact by an adversary, implementations of the
Kademlia table should avoid taking on new members on incoming contact unless the table is
well-stocked from outbound queries. Readers of the original Kademlia paper may easily
assume that liveness checks on bucket members should be performed just when a new node
tries to enter the bucket, but doing so increases the risk of emptying the table through
DoS. We therefore recommend to perform liveness checks on a separate schedule which is
independent of incoming requests. Checks may also be paused or delayed when the node is
under high load. The number of past liveness checks performed on a bucket member is an
important indicator of its age: Implementations should favor long-lived nodes and may
relax liveness checks according to node age.

A well-researched countermeasure to sybil attacks is to make creation of identities
computationally expensive. While effective in theory, there are significant downsides to
this approach. Nodes on resource-constrained devices such as mobile phones may not be able
to solve the computational puzzle in time to join the network. Continuous advances in
hashing technology which speed up cryptocurrency proof-of-work algorithms show that this
way of securing the network requires constant adjustments to thresholds and can never beat
determined attackers.

Support for mixed ENR identity schemes, described later in this document, allows for an
escape hatch to introduce arbitrary optional constraints (including proof-of-work) on node
identities. Thus, while the issue is not directly addressed at wire protocol level, there
is no inherent blocker for solving it as the need arises.

## Node Records and Their Properties

In Discovery v5, all node information is exchanged using [node records]. Records are
self-signed by the node they describe and contain arbitrary key-value pairs. They also
contain a sequence number to determine which copy of the record is newer when multiple
copies are available. When a node record is changed by its owner, the sequence number
increases. The new record 'syncs' to neighboring nodes because they will request it during
liveness revalidation. The record is also 'pushed' on to newly seen nodes as part of the
handshake.

Signing records prevents any intermediary node from changing the content of a record. Any
node's information is either available in the exact form it was published or not at all.
To make the system secure, proper validation of records is important. Implementations must
verify the signature of all received records. Implementations should also avoid sharing
records containing no usable IP addresses or ports and check that Internet hosts do not
attempt to share records containing LAN IP addresses.

## On Encryption

An early draft of Discovery v5 integrated weak obfuscation based on XORing packet content
as an optional facility. As development of the protocol progressed, we understood that
traffic amplification, replay and packet authentication could all be solved by introducing
a real encryption scheme. The way the handshake and encryption works is primarily aimed at
these issues and is not supposed to ensure complete anonymity of DHT users. While it does
protect against passive observers, the handshake is not forward-secure and active protocol
participants can access node information by simply asking for it.

Node identities can use different kinds of keys depending on the identity scheme used in
the node record. This has implications on the handshake because it deals with the public
key used to derive the identity. Implementations of Discovery v5 must agree on the set of
supported identity schemes to keep the network interoperable and custom code to verify the
handshake is required for every new scheme. We believe this is an acceptable tradeoff
because introducing a new kind of node identity is a rare event.

Since the handshake performs complex cryptographic operations (ECDH, signature
verification) performance of the handshake is a big concern. Benchmarking the experimental
Go implementation shows that the handshake computation takes 500µs on a 2014-era laptop
using the default secp256k1/keccak256 identity scheme. That's a lot, but note the cost
amortizes because nodes commonly exchange multiple packets. Subsequent packets in the same
conversation can be decrypted and authenticated in just 2µs. The most common protocol
interaction is a FINDNODE request on an unknown node with 4 NODES responses.

To put things into perspective: encryption and authentication in Discovery v5 is still a
significant improvement over the authentication scheme used in Discovery v4, which
performs secp256k1 signature 'recovery' (benchmark: ~170µs) on every packet. A FINDNODE
interaction with an unknown v4 node takes 7 packets (2x PING/PONG, FINDNODE, 2x NEIGHBORS)
and costs 1.2ms on each side for the crypto alone. In addition, the v5 handshake reduces
the risk of computational DoS because it costs as much to create as it costs to verify and
cannot be replayed.

## On Amplification and Replay

Any openly accessible packet-based system must consider misuse of the protocol for traffic
amplification purposes. There are two possible avenues of attack: In the first, an
adversary who wishes to attack a third-party host may send packets with 'spoofed' source
IP address to a node, attempting to make the node send a larger response to the victim
endpoint. In the second, the adversary attempts to install a node record containing the
victim's endpoint in the DHT, causing other nodes to direct packets to the victim.

The handshake handles the first kind of attack by responding with a small WHOAREYOU packet
whenever any request is received from an unknown endpoint. This is safe because the
adversary's packet is always larger than the WHOAREYOU response, removing the incentive
for the attack. To make the countermeasure work, implementations must keep session secrets
not just per node ID, but also per node IP.

The second kind of attack--- installing the victim as a node ---is handled by requiring
that implementations mustn't answer queries with nodes whose liveness hasn't been
verified. When a node is added to the Kademlia table, it must pass at least one check on
the IP declared in the node record before it can be returned in a NODES response.

An adversary may also try to replay previously sent/seen packets to impersonate a node or
disturb the operation of the protocol. Session keys per node-ID/IP generally prevent
replay across sessions. The `request-id`, mirrored in response packets, prevents replay of
responses within a session.

### Session message, the new packet type

The [session message packet] is a unicast notification so by definition it doesn't trigger a
response. Introducing this new message container removes the otherwise induced DoS attack
vector that sending a [RELAYMSG] to a target will trigger the target to send 2 messages, a
response as well as the [RELAYINIT] message.

A session message doesn't trigger a response on the higher layer, the discv5 equivalent to
TLS if you may, neither. If a session is not at hand to encrypt a session message, the session
message is dropped, contrary to an ordinary message packet which then would be sent a random
packet and await a [WHOAREYOU] response from the peer.

### Redundancy of ENRs in NODES responses and connectivity status assumptions about Relay and Bob

Often the same peers get passed around in NODES responses by different peers. The chance
of seeing a peer received in a NODES response again in another NODES response is high as
k-buckets favour long lived connections to new ones. This makes the need for a storing
back up relays for peers small.

Apart from the state that is saved by not storing more than the last peer to send us an
ENR as its potential relay, the longer time that has passed since a peer sent us an ENR,
the less guarantee we have that the peer is in fact connected to the owner of that ENR and
hence of its ability to relay.

### Job of keeping the hole punched falls on Bob and Bob's incentive to do so

UDP session table entry lifetimes are configurable, though a common lower bound is 20
seconds. Bob must periodically reset the session table entry for Alice in its NAT to keep
the hole for Alice punched. If Alice too is behind NAT, it must do the same for Bob.
Implementations must ensure, when a node behind NAT does not send a packet to a peer
within the entry lifetime then an empty packet is sent that is dropped by the peer.

NAT hole punching unavoidably creates overhead for all nodes in the network but once a
hole is punched, keeping it punched requires no interaction between peers. The incentive
for nodes behind NAT to keep holes for its peers punched is to avoid reestablishing a
session. If there is no hole for Alice in Bob's NAT when Alice carries out a [liveness
check], Bob is considered offline and the session to Bob useless. If the node behind NAT
intends to frequently communicate with a peer, reestablishing the session is more costly
than managing the interval of sent packets to that peer.

### Discovering if the local node is behind NAT and must keep holes for peers punched

A node may at start-up be assigned an externally reachable socket to advertise as well as
a listen socket. If those sockets are not equivalent, the node is behind NAT and the
[mechanism for keeping holes punched] is activated. Like so, a node assumes it is behind
NAT if an externally reachable socket is omitted from the initial configuration and must
activate the mechanism for keeping holes punched. The [runtime address discovery]
mechanism can discovery the external endpoint address used by the local node. Once a new
externally reachable endpoint is known, implementations will try to bind to its IP address
at some number of randomly selected ports from a given range of probably unused ports. If
binding succeeds with any port, the node is not behind NAT and the mechanism for keeping
holes punched is deactivated.

This solution assumes, in most scenarios where port-forwarding cannot be configured the
local node host's address is private to the address realm of the device operating the NAT
level furthest from the local node host. If the host and NAT device use the same IP
address, binding will always succeed, so this method may give a false negative. However,
this is not detrimental. A node behind NAT that deactivates the mechanism for keeping
holes punched will more frequently have to re-establish sessions to its peers.

### Limiting resource consumption of peers behind symmetric NATs, useful for light-clients

Peers with unreachable ENRs do not get inserted into node table buckets. Nodes that are
behind symmetric NATs will naturally never succeed in pinpointing one external socket for
peers to reach them on by [runtime address discovery] and therefore their unreachable ENRs
will never update to reachable ENRs.

This means, these peers will never respond to requests, as only peers in the node table
are sent requests. This does not cohere with the p2p-model, rather the server-client model
where the peer with a unreachable ENR acts as the client. This misalignment is especially
bothersome for well behaving (externally reachable) light-clients operating on limited
resources. Discv5.2 corrects this side-effect of runtime address discovery by introducing
a configurable limit to the number of sessions at a time with peers with unreachable ENRs,
the lower limit being 1. Nodes must accept sessions with at least one peer with a
unreachable ENR to for runtime address discovery to be enabled on the discv5.2 network.

### Fault tolerance and connectivity

As was already the case in discv5, if a request to a node times out, (after the configured
number of retries) that peer is considered unresponsive and the session can be failed.
Theoretically, peers behind NAT that repeatedly fail at taking responsibility for their
inconvenient topology, i.e. fail at keeping holes punched in their NAT for their peers,
could be banned by other peers from re-connecting within a set duration. This would
certainly add to the incentive for nodes behind NAT to behave, however it can result in
bad recovery from network-wide failure if many nodes simultaneously get blocked from
further sessions establishment due to unresponsiveness. 

The relation between two discv5 peers' k-buckets is not necessarily symmetric, one node
having a peer in its k-buckets doesn't necessarily mean vv is true. Behaving nodes may very
well have sessions to peers they don't have in their k-buckets. Increasing the frequency of
discv5's [PING] liveness check for peers in k-buckets is therefore not enough to ensure
connectivity across discv5.2. To keep NATs open for new incoming connections, packets sent
to keep holes punched must be sent to all peers which a node has a session with.

# References

- Petar Maymounkov and David Mazières.
  *Kademlia: A Peer-to-peer Information System Based on the XOR Metric.* 2002.\
  <https://www.scs.stanford.edu/~dm/home/papers/kpos.pdf>

- Atul Singh, Tsuen-Wan “Johnny” Ngan, Peter Druschel and Dan S. Wallach.
  *Eclipse Attacks on Overlay Networks: Threats and Defenses*. 2006.\
  <https://www.cs.rice.edu/~dwallach/pub/eclipse-infocom06.pdf>

- Ingmar Baumgart and Sebastian Mies.
  *S/Kademlia: A Practicable Approach Towards Secure Key-Based Routing.* 2007.\
  <https://telematics.tm.kit.edu/publications/Files/267/SKademlia_2007.pdf>

- Xin Sun, Ruben Torres and Sanjay Rao. *Feasibility of DDoS Attacks with P2P Systems and
  Prevention through Robust Membership Management.* 2007.\
  <https://docs.lib.purdue.edu/cgi/viewcontent.cgi?article=1357&context=ecetr>

- Erik Hjelmvik and Wolfgang John. *Breaking and Improving Protocol Obfuscation.* 2010.\
  <https://internetstiftelsen.se/docs/hjelmvik_breaking.pdf>

- Adam Langley and Wan-Teh Chang. *QUIC Crypto*. 2016.\
  <https://docs.google.com/document/d/1g5nIXAIkN_Y-7XJW5K45IblHd_L2f5LTaDUDwvZ5L6g>

- W3C Credentials Community Group. *Decentralized Identifiers (DIDs) Spec.* 2017.\
  <https://w3c-ccg.github.io/did-spec>

- Seoung Kyun Kim, Zane Ma, Siddharth Murali, Joshua Mason, Andrew Miller and Michael Bailey.
  *Measuring Ethereum Network Peers*. 2018.\
  <http://mdbailey.ece.illinois.edu/publications/imc18_ethereum.pdf>

- Yuval Marcus, Ethan Heilman and Sharon Goldberg.
  *Low-Resource Eclipse Attacks on Ethereum’s Peer-to-Peer Network.* 2018.\
  <https://eprint.iacr.org/2018/236.pdf>

- Dan Kegel, Bryan Ford and Pyda Srisuresh. 
*Peer-to-peer communication across network address translators - USENIX*. 2005.\
<https://www.usenix.org/legacy/event/usenix05/tech/general/full_papers/ford/ford.pdf>

- Cullen Fluffy Jennings and François Audet. 
*RFC 478: FTP Server-server interaction - II, IETF Datatracker*. 1973.\
<https://datatracker.ietf.org/doc/html/rfc478> 

- Philip Matthews, Iljitsch Van Beijnum and Marcelo Bagnulo.
 *RFC FT-IETF-behave-V6V4-xlate-stateful: Stateful NAT64: Network address and protocol translation from IPv6 clients to ipv4 servers, IETF Datatracker*. 2011.\ 
 <https://datatracker.ietf.org/doc/html/rfc6146>

[wire protocol]: ./discv5-wire.md
[node records]: ../enr.md
[session message packet]: ./discv5-wire.md#session-message-packet-flag--3
[WHOAREYOU]: ./discv5-wire.md#whoareyou-packet-flag--1
[PING]: ./discv5-wire.md#ping-request-0x01
[RELAYINIT]: ./discv5-wire.md#relayinit-notification-0x07
[RELAYMSG]: ./discv5-wire.md#relaymsg-notification-0x08