# Node Discovery Protocol v5 - Rationale

**Protocol version v5.1**

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

Ensure the DHT can accommodate ENR's with multiple identity systems. This will allow
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
their neighbors. For the topic advertisement system, registrants collect tickets and must
use them as soon as the ticket expires to place an ad in a topic queue.

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
'regions of address space'. These concepts are used to build the [topic-based node index].

Kademlia is often criticized as a naive design with obvious weaknesses. We believe that
most issues with simple Kademlia can be overcome by careful programming and the benefits
of a simple design outweigh the cost and risks of maintaining a more complex system.

## Sybil and Eclipse Attacks

The well-known 'sybil attack' is based on the observation that creating node identities is
essentially free. In any system using a measure of proximity among node identities, an
adversary may place nodes close to a chosen node by generating suitable identities. For
basic node discovery through network enumeration, the 'sybil attack' poses no significant
challenge. Sybils are a serious issue for the topic-based node index, especially for
topics provided by few participants, because the index relies on node distance.

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
interaction is a FINDNODE or TOPICQUERY request on an unknown node with 4 NODES responses.

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

## The Topic Index

Using FINDNODE queries with appropriately chosen targets, the entire DHT can be sampled by
a random walk to find all other participants. When building a distributed application, it
is often desirable to restrict the search to participants which provide a certain service.
A simple solution to this problem would be to simply split up the network and require
participation in many smaller application-specific networks. However, such networks are
hard to bootstrap and also more vulnerable to attacks which could isolate nodes.

The topic index provides discovery by provided service in a different way. Nodes maintain
a single node table tracking their neighbors and advertise 'topics' on nodes found by
randomly walking the DHT. While the 'global' topic index can be also spammed, it makes
complete isolation a lot harder. To prevent nodes interested in a certain topic from
finding each other, the entire discovery network would have to be overpowered.

To make the index useful, searching for nodes by topic must be efficient regardless of the
number of advertisers. This is achieved by estimating the topic 'radius', i.e. the
percentage of all live nodes which are advertising the topic. Advertisement and search
activities are restricted to a region of DHT address space around the topic's 'center'.

We also want the index to satisfy another property: When a topic advertisement is placed,
it should last for a well-defined amount of time. This ensures nodes may rely on their
advertisements staying placed rather than worrying about keeping them alive.

Finally, the index should consume limited resources. Just as the node table is limited in
number and size of buckets, the size of the index data structure on each node is limited.

### Why should advertisers wait?

Advertisers must wait a certain amount of time before they can be registered. Enforcing
this time limit prevents misuse of the topic index because any topic must be important
enough to outweigh the cost of waiting. Imagine a group phone call: announcing the
participants of the call using topic advertisement isn't a good use of the system because
the topic exists only for a short time and will have very few participants. The waiting
time prevents using the index for this purpose because the call might already be over
before everyone could get registered.

### Dealing with Topic Spam

Our model is based on the following assumptions:

- Anyone can place their own advertisements under any topics and the rate of placing ads
  is not limited globally. The number of active ads for any node is roughly proportional
  to the resources (network bandwidth, mostly) spent on advertising.
- Honest actors whose purpose is to connect to other honest actors will spend an adequate
  amount of efforts on registering and searching for ads, depending on the rate of newly
  established connections they are targeting. If the given topic is used only by honest
  actors, a few registrations per minute will be satisfactory, regardless of the size of
  the subnetwork.
- Dishonest actors may want to place an excessive amount of ads just to disrupt the
  discovery service. This will reduce the effectiveness of honest registration efforts by
  increasing the topic radius and/or topic queue waiting times. If the attacker(s) can
  place a comparable amount or more ads than all honest actors combined then the rate of
  new (useful) connections established throughout the network will reduce proportionally
  to the `honest / (dishonest + honest)` registration rates.

This adverse effect can be countered by honest actors increasing their registration and
search efforts. Fortunately, the rate of established connections between them will
increase proportionally both with increased honest registration and search efforts. If
both are increased in response to an attack, the required factor of increased efforts from
honest actors is proportional to the square root of the attacker's efforts.

### Detecting a useless registration attack

In the case of a symmetrical protocol, where nodes are both searching and advertising
under the same topic, it is easy to detect when most of the found ads turn out to be
useless and increase both registration and query frequency. It is a bit harder but still
possible with asymmetrical (client-server) protocols, where only clients can easily detect
useless registrations, while advertisers (servers) do not have a direct way of detecting
when they should increase their advertising efforts. One possible solution is for servers
to also act as clients just to test the server capabilities of other advertisers. It is
also possible to implement a feedback system between trusted clients and servers.

## Service Discovery Security Goals

The following security goals are specific to DISC-NG service discovery. They complement the Node Discovery v5 security goals listed above.

### Advertisement Flooding

A malicious advertiser attempts to fill registrar ad caches with its own advertisements,or with advertisements for services it controls, so that honest advertisements are delayed or excluded.

DISC-NG mitigates this attack by using bounded ad caches and waiting-time-based admission control. Advertisements that increase cache occupancy or reduce cache diversity receive longer waiting times.

### Registrar Resource Exhaustion

A malicious node sends many registration attempts, retries, or malformed requests in an attempt to exhaust registrar memory, CPU, or bandwidth. DISC-NG mitigates memory exhaustion by avoiding unbounded per-request registrar state for pending registrations. Pending registration state is carried by advertisers in signed tickets. Registrars may also apply local rate limits, request validation, and temporary exclusion policies for nodes that repeatedly fail DISC-NG operations.

### Service Censorship

A malicious actor attempts to prevent honest advertisements for a target service from being discovered. This may be attempted by flooding registrars with competing advertisements, by returning incomplete or misleading lookup responses, or by trying to control nodes in parts of the key space relevant to a service. DISC-NG mitigates this risk by distributing advertisement placement across the service-centred key space, by using multiple registrars, and by allowing discoverers to query registrars across multiple buckets rather than relying on a single service-specific location.

### Service Eclipse

A malicious actor attempts to make discoverers of a target service receive only advertisements for malicious nodes. DISC-NG reduces the effectiveness of this attack by requiring discoverers to collect advertisements from multiple registrars and by encouraging diversity in registrar ad caches. Parameters such as `Flookup`, `Freturn`, `Klookup`, and `Kregister` control the trade-off between lookup cost and diversity of sources.

### Service-Table Poisoning

TODO: A malicious registrar may return misleading neighbour ENRs in DISC-NG responses in order to pollute the requester’s service table. 

### Advertisement Redirection

A malicious node may attempt to advertise an ENR that directs discoverers to a victim endpoint or to a node that does not actually participate in the advertised service. DISC-NG relies on ENR validation and on the self-signed nature of node records to prevent intermediaries from modifying advertised node information. Applications using discovered advertisements should still perform their normal service-level checks before relying on the discovered peer.

## Service Discovery with DISC-NG

Ordinary Node Discovery v5 maintains a global discovery network and allows nodes to discover other nodes. Applications use this global discovery substrate to find peers that participate in higher-level services. The participants of a service form a service-specific overlay.

Without a service-discovery extension, a node can search for service-specific peers by sampling nodes through ordinary node discovery and then checking whether the sampled nodes support the desired service. This check is outside the ordinary node discovery algorithm: depending on the application, service support may be inferred from information in the ENR, discovered by establishing a higher-layer connection and negotiating supported protocols, or determined by a service-specific query.

This random-sampling approach has a useful security property: the search is spread across the global discovery network rather than being concentrated at a small set of predictable service-specific nodes. However, it is inefficient, especially when the target service is supported by only a small fraction of nodes. In that case, many unrelated nodes must be contacted before enough service peers are found.

DISC-NG adds explicit service discovery to Node Discovery v5. Nodes that participate in a service can advertise that participation. Other nodes can query for advertisements for the service and use the returned ENRs as candidate peers.

### Why Not Use Separate Discovery Networks?

A simple way to discover service-specific peers would be to run a separate discovery network for each service. Nodes interested in a service would join that service's discovery network directly.

This approach makes each service responsible for its own bootstrapping and security. New or small services would have few participants and would therefore be easier to isolate or eclipse. Running many small discovery networks would also duplicate infrastructure and fragment the global peer-discovery ecosystem.

Instead, DISC-NG reuses the ordinary Node Discovery v5 network. Services benefit from the existing global discovery network, and nodes can discover peers for many services without joining a separate discovery DHT for each one.

### Why Not Store Advertisements Only Near the Service Identifier?

A simple DHT-style design would store all advertisements for a service at the nodes whose node IDs are closest to the service identifier. Advertisers and discoverers would then know where to place and retrieve advertisements. This design is efficient, but it concentrates load and trust near the service identifier. Popular services would create hotspots around their service identifiers. More importantly, an adversary could generate node IDs close to a chosen service identifier and attempt to control advertisement storage or lookup results for that service. Therefore, DISC-NG does not rely only on the closest nodes to a service identifier. Advertisements are placed across buckets of a service-centred table, and lookups progress from buckets far from the service identifier towards buckets closer to it. This keeps discovery distributed while still giving advertisers and discoverers a structured way to meet.

### Why Use Service-Centred Tables?

The ordinary node table is centred on the local node ID. It is useful for maintaining the global discovery network and for finding nodes close to arbitrary node IDs. For service discovery, however, advertisers and discoverers need a shared reference point: the service identifier. A service table is centred on the service identifier rather than on the local node ID. This gives advertisers and discoverers for the same service a compatible view of the key space. An advertiser uses the service table to choose registrars for advertisement placement. A discoverer uses the service table to choose registrars for lookup. Service tables do not replace the ordinary node table. They are derived from ordinary node discovery state and refined using additional nodes returned by DISC-NG responses.

### Why Use Registrars?

A registrar is a DISC-NG-capable node that stores admitted advertisements and returns them to discoverers. Registrars decouple advertisers from discoverers. Advertisers do not need to be online at the exact moment a discoverer performs a lookup, as long as their advertisements remain stored at registrars. Discoverers do not need to contact arbitrary nodes and test their service membership one by one; they can query registrars for advertisements that have already been placed. Because any DISC-NG-capable node can act as a registrar, the design does not depend on a central registry or trusted service-specific bootstrap node.

### Why Use Admission Control?

Registrars have finite storage. If every registration request were admitted immediately, popular services or malicious advertisers could dominate the ad cache and crowd out other advertisements. DISC-NG uses admission control to decide when an advertisement may enter the cache. Admission is based on a waiting-time function. Advertisements that would increase cache occupancy or reduce diversity receive longer waiting times. This makes flooding more expensive, promotes diversity across services and IP prefixes, and helps ensure that less popular services can still obtain representation in registrar caches.

### Why Should Advertisers Wait?

Waiting time is the registrar's main admission-control mechanism. The waiting time makes it costly to flood registrars with advertisements, limits the rate at which the ad cache fills, and gives the registrar a way to prefer advertisements that improve cache diversity. An advertiser that receives a waiting time must come back later with a valid ticket before the advertisement can be admitted. Waiting also avoids a simple replacement-policy problem. If registrars used only policies such as least-recently-used replacement, an attacker could repeatedly send new advertisements to evict honest ones. With waiting-time admission, the attacker must pay the cost of waiting before advertisements are admitted.

### Why Use Tickets?

Tickets allow a registrar to enforce waiting without storing unbounded per-request state. A ticket records the advertisement and timing information needed to show that the advertiser has waited. The ticket is carried by the advertiser and returned to the registrar on retry. The registrar verifies the ticket and recomputes the waiting time against the current cache state. This design prevents pending registrations from consuming unbounded registrar memory. If an advertiser never returns, the registrar does not need to clean up per-request state for that advertiser.

### Why Recompute Waiting Times?

The state of the ad cache may change while an advertiser is waiting. Advertisements may expire, new advertisements may be admitted, and the diversity of the cache may change. For this reason, the waiting time in a ticket is not binding. When the advertiser retries, the registrar recomputes the waiting time using the current cache state. The advertiser is admitted only if its accumulated waiting time is sufficient according to the recomputed value. This prevents stale tickets from forcing admission under cache conditions that no longer justify it.

### Why Include Service Similarity?

The service-similarity component increases waiting time when the incoming advertisement is for a service that is already well represented in the registrar's ad cache. This prevents popular services from crowding out less represented services. It also helps less popular services obtain cache entries even when the total registration demand is high.

### Why Include IP Similarity?

A malicious actor may create many node identities from a small number of physical hosts or IP prefixes. Counting only node IDs would not distinguish this behaviour from a diverse set of independent advertisers. The IP-similarity component increases waiting time for advertisements whose IP prefixes are already overrepresented in the cache. This discourages a small number of IP prefixes from dominating the ad cache. This approach is more flexible than a fixed rule such as "only one node per prefix". Fixed prefix limits can harm honest users behind NATs, shared hosting providers, or other common infrastructure. A similarity score instead increases cost gradually as concentration increases.

### Why Use a Safety Constant?

If an advertisement is for an underrepresented service and comes from an underrepresented IP prefix, the service-similarity and IP-similarity components may both be small. The safety constant ensures that the waiting time does not become zero in such cases. This provides a baseline admission cost and helps prevent the ad cache from being filled too quickly by advertisements that appear diverse only because they use random service identifiers or diverse IP prefixes.

TODO: Check if this constant was mentioned in the theory document

### Why Use a Waiting-Time Lower Bound?

If waiting times could decrease freely as the ad cache changes, advertisers would be incentivised to repeatedly request new tickets in the hope of obtaining a shorter wait. This would create unnecessary traffic and processing load. The lower-bound mechanism ensures that a new waiting time cannot improve on a previous waiting time by more than the elapsed time. It removes the incentive to repeatedly request new tickets while keeping registrar state bounded.

The lower-bound state is maintained only for bounded structures, such as services already present in the ad cache and prefixes represented in the IP similarity tree.

### Why Return Neighbour ENRs?

A service table is initially derived from the ordinary node table. However, the ordinary node table is centred on the local node ID, not on the service identifier. It may therefore contain few nodes in buckets that are important for a particular service. DISC-NG responses can include additional neighbour ENRs selected from the responder's view of the service-centred key space. Advertisers and discoverers can use these ENRs to refine their local service tables. Returned ENRs are auxiliary routing information, not lookup results. Implementations must validate them and check DISC-NG capability before inserting them into service tables.

### Why Support Mixed Deployments?

DISC-NG is an extension to Node Discovery v5. During deployment, some nodes may support only ordinary Node Discovery v5 while others support both ordinary Node Discovery v5 and DISC-NG. Nodes that do not support DISC-NG remain useful for maintaining the ordinary discovery network. They are not selected for DISC-NG registration or lookup operations, but they can still participate in ordinary node discovery. DISC-NG-capable nodes advertise support in their ENR. This allows implementations to build service tables from ordinary node discovery state while selecting only nodes that can handle DISC-NG messages.

# References

- Petar Maymounkov and David Mazières.
  *Kademlia: A Peer-to-peer Information System Based on the XOR Metric.* 2002.\
  <https://www.scs.stanford.edu/~dm/home/papers/kpos.pdf>

- Atul Singh, Tsuen-Wan “Johnny” Ngan, Peter Druschel, Dan S. Wallach.
  *Eclipse Attacks on Overlay Networks: Threats and Defenses*. 2006.\
  <https://www.cs.rice.edu/~dwallach/pub/eclipse-infocom06.pdf>

- Ingmar Baumgart and Sebastian Mies.
  *S/Kademlia: A Practicable Approach Towards Secure Key-Based Routing.* 2007.\
  <https://telematics.tm.kit.edu/publications/Files/267/SKademlia_2007.pdf>

- Xin Sun, Ruben Torres and Sanjay Rao. *Feasiblity of DDoS Attacks with P2P Systems and
  Prevention through Robust Membership Management.* 2007.\
  <https://docs.lib.purdue.edu/cgi/viewcontent.cgi?article=1357&context=ecetr>

- Erik Hjelmvik, Wolfgang John. *Breaking and Improving Protocol Obfuscation.* 2010.\
  <https://internetstiftelsen.se/docs/hjelmvik_breaking.pdf>

- Adam Langley, Wan-Teh Chang. *QUIC Crypto*. 2016.\
  <https://docs.google.com/document/d/1g5nIXAIkN_Y-7XJW5K45IblHd_L2f5LTaDUDwvZ5L6g>

- W3C Credentials Community Group. *Decentralized Identifiers (DIDs) Spec.* 2017.\
  <https://w3c-ccg.github.io/did-spec>

- Seoung Kyun Kim, Zane Ma, Siddharth Murali, Joshua Mason, Andrew Miller, Michael Bailey.
  *Measuring Ethereum Network Peers*. 2018.\
  <http://mdbailey.ece.illinois.edu/publications/imc18_ethereum.pdf>

- Yuval Marcus, Ethan Heilman, Sharon Goldberg.
  *Low-Resource Eclipse Attacks on Ethereum’s Peer-to-Peer Network.* 2018.\
  <https://eprint.iacr.org/2018/236.pdf>

[wire protocol]: ./discv5-wire.md
[topic-based node index]: ./discv5-theory.md#topic-advertisement
[node records]: ../enr.md
