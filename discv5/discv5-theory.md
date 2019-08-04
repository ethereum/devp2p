# Node Discovery Protocol v5 - Theory

**Draft of August 2019.**

Note that this specification is a work in progress and may change incompatibly without
prior notice.

## Nodes, Records and Distances

A participant in the Node Discovery Protocol is represented by a 'node record' as defined
in [EIP-778]. The node record keeps arbitrary information about the node. For the purposes
of this protocol, the node must at least provide an IP address (`"ip"` or `"ip6"` key) and
UDP port (`"udp"` key) in order to have it's record relayed in the DHT.

Node records are signed according to an 'identity scheme'. Any scheme can be used with
Node Discovery Protocol, and nodes using different schemes can communicate.

The identity scheme of a node record defines how a 32-byte 'node ID' is derived from the
information contained in the record. The 'distance' between two node IDs is the bitwise
XOR of the IDs, taken as the number.

    distance(n₁, n₂) = n₁ XOR n₂

In many situations, the logarithmic distance (i.e. length of common prefix in bits) is
used in place of the actual distance.

    logdistance(n₁, n₂) = log2(distance(n₁, n₂))

## Maintaining The Local Record

Participants should update their record, increase the sequence number and sign a new
version of the record whenever their information changes. This is especially important for
changes to the node's IP address and port. Implementations should determine the external
endpoint (the Internet-facing IP address and port on which the node can be reached) and
include it in their record.

If communication flows through a NAT device, the UPnP/NAT-PMP protocols or the mirrored
UDP envelope IP and port found in the [PONG] message can be used to determine the external
IP address and port.

If the endpoint cannot be determined (e.g. when the NAT doesn't support 'full-cone'
translation), implementation should omit IP address and UDP port from the record.

## Node Table

Nodes keep information about other nodes in their neighborhood. Neighbor nodes are stored
in a routing table consisting of 'k-buckets'. For each `0 ≤ i < 256`, every node keeps a
k-bucket for nodes of `logdistance(self, n) == i`. The Node Discovery Protocol uses `k =
16`, i.e. every k-bucket contains up to 16 node entries. The entries are sorted by time
last seen — least-recently seen node at the head, most-recently seen at the tail.

Whenever a new node N₁ is encountered, it can be inserted into the corresponding bucket.
If the bucket contains less than `k` entries N₁ can simply be added as the first entry. If
the bucket already contains `k` entries, the liveness of the least recently seen node in
the bucket, N₂, needs to be revalidated. If no reply is received from N₂ it is considered
dead, removed and N₁ added to the front of the bucket.

Neighbors of very low distance are unlikely to occur in practice. Implementations may omit
buckets for low distances.

### Table Maintenance In Practice

Nodes are expected to keep track of their close neighbors and regularly refresh their
information. To do so, a lookup targeting the least recently refreshed bucket should be
performed at regular intervals.

Checking node liveness whenever a node is to be added to a bucket is impractical and
creates a DoS vector. Implementations can perform liveness checks asynchronously with
bucket addition and occasionally verify that a random node in a random bucket is live by
sending [PING]. When the PONG response indicates that a new version of the node record is
available, the liveness check should pull the new record and update it in the local table.

For FINDNODE, implementations must avoid returning any nodes whose liveness has not been
verified.

### Recursive Lookup

A 'lookup' locates the `k` closest nodes to a node ID.

The lookup initiator starts by picking `α` closest nodes to the target it knows of. The
initiator then sends concurrent [FINDNODE] packets to those nodes. `α` is an
implementation-defined concurrency parameter, typically `3`. In the recursive step, the
initiator resends FINDNODE to nodes it has learned about from previous queries. Of the `k`
nodes the initiator has heard of closest to the target, it picks `α` that it has not yet
queried and sends FINDNODE to them. Nodes that fail to respond quickly are removed from
consideration until and unless they do respond.

If a round of FINDNODE queries fails to return a node any closer than the closest already
seen, the initiator resends the find node to all of the `k` closest nodes it has not
already queried. The lookup terminates when the initiator has queried and gotten responses
from the `k` closest nodes it has seen.

## Topic Advertisement

A node's provided services are identified by arbitrary strings called *topics*. Depending
on the needs of the application, a node can advertise multiple topics or no topics at all.
Every node participating in the discovery DHT acts as an advertisement medium, meaning
that it accepts topic registrations from advertising nodes and later returns them to nodes
searching for the same topic.

The reason topic discovery is proposed in addition to application-specific networks is to
solve bootstrapping issues and improve downward scalability of subnetworks. Scalable
networks that have small subnetworks (and maybe even create new subnetworks automatically)
cannot afford to require a trusted bootnode for each of those subnets. Without a trusted
bootnode, small peer-to-peer networks are very hard to bootstrap and also more vulnerable
to attacks that could isolate nodes, especially the new ones which don't know any trusted
peers. Even though a global registry can also be spammed in order to make it harder to
find useful and honest peers, it makes complete isolation a lot harder because in order to
prevent the nodes of a small subnet from finding each other, the entire discovery network
would have to be overpowered.

### Advertisement Storage

Each node participating in the protocol stores ads for any number of topics and a limited
number of ads for each topic. The list of ads for a particular topic is called the *topic
queue* because it functions like a FIFO queue of limited length. There is also a global
limit on the number of ads regardless of the topic queue which contains them. When the
global limit is reached, the last entry of the least recently requested topic queue is
removed.

For each topic queue, the advertisement medium maintains a *wait period*. This value acts
as a valve controlling the influx of new ads. Registrant nodes communicate interest to
register an ad and receive a *waiting ticket* which they can use to actually register
after the period has passed. Since regular communication among known nodes is required for
other purposes (e.g. node liveness checks), registrants re-learn the wait period values
automatically.

The wait period for each queue is assigned based on the amount of sucessful registrations.
It is adjusted such that ads will stay in the topic queue for approximately 10 minutes.

When an ad is added to the queue, the new wait period of the queue is computed as:

    target-ad-lifetime = 600 # how long ads stay queued (10 min)
    target-registration-interval = target-ad-lifetime / queue-length
    min-wait-period = 60 # (1 min)
    control-loop-constant = 600

    period = time-of-registration - time-of-previous-registration
    new-wait-period = wait-period * exp((target-registration-interval - period) / control-loop-constant)
    wait-period = max(new-wait-period, min-wait-period)

### Advertisement Protocol

Let us assume that node `A` advertises itself under topic `T`. It selects node `C` as
advertisement medium and wants to register an ad, so that when node `B` (who is searching
for topic `T`) asks `C`, `C` can return the registration entry of `A` to `B`.

Node `A` first tells `C` that it wishes to register by requesting a ticket for topic `T`,
using the [REQTICKET] message.

    A -> C  REQTICKET

`C` replies with a ticket. The ticket contains the node identifier of `A`, the topic, a
serial number and wait period assigned by `C`.

    A <- C  TICKET

Node `A` now waits for the duration of the wait period. When the wait is over, `A` sends a
registration request including the ticket. `C` does not need to remember its issued
tickets, just the serial number of the latest ticket accepted from `A` (after which it
will not accept any tickets issued earlier).

    A -> C  REGTOPIC

If the ticket was valid, Node `C` places `A` into the topic queue for `T`. The
[REGCONFIRMATION] response message signals whether `A` is registered.

    A <- C  REGCONFIRMATION

### Ad Placement And Topic Radius Detection

When the number of nodes advertising a topic (topic size) is at least a certain percentage
of the whole discovery network (rough estimate: at least 1%), it is sufficient to select
random nodes to place ads and also look for ads at randomly selected nodes. In case of a
very high network size/topic size ratio, it helps to have a convention for selecting a
subset of nodes as potential advertisement media. This subset is defined as the nodes
whose Kademlia address is close to `keccak256(T)`, meaning that the binary XOR of the
address and the topic hash interpreted as a fixed point number is smaller than a given
*topic radius*. A radius of 1 means the entire network, in which case advertisements are
distributed uniformly.

Example:

- Nodes in the topic discovery network: 10000
- Number of advertisers of topic T: 100
- Registration frequency: 3 per minute
- Average registration lifetime: 10 minutes
- Average number of registrations of topic T at any moment: `3 * 10 * 100 = 3000`
- Expected number of registrations of T found at a randomly selected node (topic density)
  assuming a topic radius of 1: 0.3

When the number of advertisers is smaller than 1% of the entire network, we want to
decrease the topic radius proportionally in order to keep the topic density at a
sufficiently high level. To achieve this, both advertisers and searchers should initially
try selecting nodes with an assumed topic radius of 1 and collect statistical data about
the density of registrations at the selected nodes. If the topic density in the currently
assumed topic radius is under the target level (0.3 in our example), the radius is
decreased. There is no point in decreasing the targeted node subset under the size of
approximately 100 nodes since in this case even a single advertiser can easily be found.
Approximating the density of nodes in a given address space is possible by calculating the
average distance between a randomly selected address and the address of the closest actual
node found. If the approximated number of nodes in our topic radius is under 100, we
increase the radius.

## Topic Search

Finding nodes that provide a certain topic is a continuous process which reads the content
of topic queues inside the approximated topic radius. Nodes within the radius are
contacted with [TOPICQUERY] packets. Collecting tickets and waiting on them is not
required. The approximated topic radius value can be shared with the registration
algorithm if the the same topic is being registered and searched for.

To find nodes, the searcher generates random node IDs inside the topic radius and performs
recursive Kademlia lookups on them. All (intermediate) nodes encountered during lookup are
asked for topic queue enties using the [TOPICQUERY] packet.

Topic search is not meant to be the only mechanism used for selecting peers. A persistent
database of useful peers is also recommended, where the meaning of "useful" is
protocol-specific. Like any DHT algorithm, topic advertisement is based on the law of
large numbers. It is easy to spread junk in it at the cost of wasting some resources.
Creating a more trusted sub-network of peers over time prevents any such attack from
disrupting operation, removing incentives to waste resources on trying to do so. A
protocol-level recommendation-based trust system can be useful, the protocol may even have
its own network topology.

[EIP-778]: https://eips.ethereum.org/EIPS/eip-778
[PING]: ./discv5-wire.md#ping-request-0x01
[PONG]: ./discv5-wire.md#pong-response-0x02
[FINDNODE]: ./discv5-wire.md#findnode-request-0x03
[REQTICKET]: ./discv5-wire.md#reqticket-request-0x05
[REGCONFIRMATION]: ./discv5-wire.md#regconfirmation-response-0x08
[TOPICQUERY]: ./discv5-wire.md#topicquery-request-0x09
