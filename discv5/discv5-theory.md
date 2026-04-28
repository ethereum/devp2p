# Node Discovery Protocol v5 (Discv5) - Theory

**Protocol version: draft**

This document explains the algorithms and data structures used by the protocol.

Discv5 is a service discovery protocol built on top of the node discovery DHT.
It allows nodes participating in a given service to advertise themselves to the network and allows other nodes to discover these advertisements. 
The protocol uses pseudo-random advertisement placement and structured lookup over the DHT. 
The protocol is also described in the [DiscNG research paper](ttps://ieeexplore.ieee.org/document/10629017).


## Services and Roles
Every node may perform all of the following roles at the same time:

- **Advertiser:** a node participating in a service and trying to make itself discoverable.
- **Discoverer:** a node looking for peers participating in a service.
- **Registrar:** a node that accepts advertisements for arbitrary services and later returns them to discoverers.

These roles are logical only.
The protocol does not require different classes of nodes.
Discv5 runs over the same global discovery DHT used by all nodes.
Each node can be a part of any number of services (i.e., applications) each identified by a service identifier.
The service identifier is a 32-byte hash of an application-defined service identifier. **TODO** do we need to specify the hash function?


## Nodes, Records and Distances

A participant in the Node Discovery Protocol is represented by a node record as defined in [EIP-778]. The node record keeps arbitrary information about the node.
The node must at least provide an IP address (`"ip"` or `"ip6"` key) and UDP port (`"udp"` key) in order to be reachable through discovery and to be returned to other nodes.

Node records are signed according to an identity scheme.
Any scheme can be used with Node Discovery Protocol, and nodes using different schemes can communicate.

The identity scheme of a node record defines how a 32-byte 'node ID' is derived from the information contained in the record.
The distance between two node IDs is the bitwise XOR of the IDs, taken as the big-endian number.

    distance(n₁, n₂) = n₁ XOR n₂

In many situations, the logarithmic distance is used in place of the actual distance.

    logdistance(n₁, n₂) = log2(distance(n₁, n₂))

### Maintaining The Local Node Record

Participants should update their record, increase the sequence number and sign a new version of the record whenever their information changes.
This is especially important for changes to the node's IP address and port. 
Implementations should determine the external endpoint (the Internet-facing IP address and port on which the node can be reached) and
include it in their record.

If communication flows through a NAT device, the UPnP/NAT-PMP protocols or the mirrored UDP envelope IP and port found in the [PONG] message can be used to determine the external IP address and port.

If the endpoint cannot be determined (e.g. when the NAT doesn't support 'full-cone' translation), implementations should omit IP address and UDP port from the record.

## Do we need the session description here?


## Routing Tables and Service Tables
Nodes maintain a routing table around their own node ID.
The table is partitioned into buckets by logarithmic distance from the local node. 

For each service, a node acting as an Advertised or Discoverer for, additionally uses a service-specific table centered around the server identifier rather than around the local node ID.

For service identifier `s`, the service table is written as

    B(s) = { b₀(s), b₁(s), ..., b₂₅₅(s) }

where bucket `bᵢ(s)` contains nodes whose IDs share a common prefix of length `i` with `s`.

Service tables are initialized from the local routing table and are refined opportunistically
during service advertising and lookup.
Responses from registrars include additional peers, which are used to populate service tables closer to the service.

Implementations should treat service tables as soft state and rebuild them as needed.
Discv5 has two main operations:

- **Advertisement placement:** advertisers place advertisements on registrars across the DHT.
- **Lookup:** discoverers query registrars to retrieve advertisements for a service.

An advertisement is a data structure binding a service to an advertiser node.


<!-- [REGservice] contains the service, an optional ticket, and an ENR (`ENR *enr.Record`).
This indicates that the advertised object is the advertiser's ENR. -->



## Advertisement Placement
For every service `s` a node advertises, a dedicated placement process is spawned. 
The goal of this process is to maintain `Kregister` advertisements per bucket in `B(s)`.
The process starts from the furthest bucket `b0(s)`  and progresses towards the closest bucket `b255(s)`.
While the number of ongoing or active registrations in bucket `i` is below `Kregister`, the advertiser picks a
random registrar from `bᵢ(s)` and starts an advertisement attempt.
The random selection must not repeatedly return the same registrar during the same placement cycle.
A single advertisement attempt is carried by [REGservice].

### REGservice

[REGservice] registers the advertiser in a registrar's service queue using a ticket. The message contains:

- `ReqID`: request identifier
- `serviceID`: the 32-byte serviceID
- `Ticket`: the previously issued ticket, or empty on the first attempt
- `ENR`: the advertiser ENR
- `Buckets`: distances from the service where the advertiser still has space in its
  search table

The registration process contains the following data exchange:

1. The advertiser sends [REGservice] with `service = t`, `Ticket = ""`, and `ENR` set to its
   current node record.
2. If the registrar can admit the advertisement immediately, it confirms registration.
3. Otherwise the registrar returns a ticket and waiting time.
4. The advertiser waits and sends [REGservice] again with the returned ticket.
5. The registrar can either admit the ticket or issue a new ticket with a new waiting time. 
6. If the registrar is unreachable or rejects the request, the attempt fails and the advertiser moves to another registrar.

An admitted advertisement remains stored for an expiry duration `E`.
Advertisers should continuously renew advertisements to keep the target number of active placements in each bucket.

## Lookup
Lookup locates advertisers for a service by querying registrars along the service table.
The service specifies the target number of distinct advertisers the discoverer wants to collect `Flookup`.
The process starts from the furthest bucket `b0(s)`  and progresses towards the closest bucket `b255(s)`.
The discoverer queries `Klookup` random registrars in each bucket of `B(s)`.
The discoverer repeats the process (going from to ) until it collest at least `Flookup` distinct advertisers, or until no unqueried
registrars remain.
A lookup request to a single registrar is carried by [serviceQUERY].


### serviceQUERY
[serviceQUERY] asks a registrar for nodes matching the given service. The wire message contains:

- `ReqID`: request identifier **TODO: how is this generated**
- `s`: the 32-byte service
- `Buckets`: distances from the service where the discoverer still has space in its search table `B(s)` and indicates where it still wants peer information for improving its service table.

The queried registrar returns a maximum of  `Freturn` advertisements and up to `XX` additional peers to enrich the service table. **TODO** do we have a limit on the number of returned peers?


### serviceNODES
[serviceNODES] is a response to [serviceQUERY] and contains:

- `ReqID`: request identifier
- `RespCount`: total number of responses to the request
- `Nodes`: ENRs matching the requested service
- **TODO: it should contain an advertisement list**

The discoverer accumulates distinct nodes from received [serviceNODES] messages to collect advertisements and populate its `B(s)` table.
Multiple responses may be sent for one request, as indicated by `RespCount`.


## Admission Control
A registrar stores admitted advertisements in an ad cache.
Each entry has expiry time `E`, after which it is removed automatically.
The ad cache has fixed capacity `C`.
An advertiser may place at most one advertisement for a given service in the ad cache of a given registrar.
Registration requests for an advertisement already present in the cache are ignored.

When a registrar receives [REGservice], it computes a waiting time based on the current state of the ad cache and the incoming advertisement and replies with [REGservice].
If the remaining waiting time is zero or negative, the advertisement is admitted immediately.
Otherwise the registrar returns a ticket and waiting time.
The registrar does not required to keep per-request state for pending registrations.
The waiting timee is held by the advertiser in the ticket signed by the advertiser.
The ticket waiting time is not binding and is reevaluated with every returning request. 
If an advertiser resends [REGservice] after the indicated amount of time, it may be issued with an additional waiting time.
If an advertiser resends [REGservice] before the indicated amount of time, the request is ignored.

### REGCONFIRMATION
[REGCONFIRMATION] is a response to [REGservice]. The wire message contains:

- `ReqID`: request identifier
- `RespCount`: total number of responses to the request
- `Ticket`: registrar-issued ticket; successful registration is indicated by zero-length
  ticket
- `WaitTime`: how long to wait until sending the next [REGservice], in milliseconds

This directly matches the admission protocol:

- if `len(Ticket) != 0`, the advertiser has not yet been admitted and must wait `WaitTime`
  before retrying;
- if `len(Ticket) == 0`, the registration has succeeded. In the current implementation log
  semantics, `WaitTime` then represents advertisement lifetime.
**TODO shouldn't we explicitely indicate 0 here? rather than relying on the length of the message?**

The response may be split across multiple packets, as indicated by `RespCount`.

## Tickets

A ticket proves that an advertiser has already waited for some amount of time with respect
to a given registrar and service advertisement.

Tickets as signed objects containing:

- a copy of the advertisement
- the ticket creation time `tinit`
- the ticket modification time `tmod`
- the remaining wait time `twait`

When an advertiser receives a ticket, it waits for the indicated time and retries [REGservice]
with the returned ticket in the `Ticket` field.

A retry is valid only during the registration window:

    tmod + twait ≤ now ≤ tmod + twait + δ

where `δ` is the registration window duration. If the advertiser retries too early, too
late, or without the latest ticket, it loses accumulated waiting time and must start over.

The waiting time in a ticket is not binding.
Every retry causes the registrar to recompute the waiting time against the current cache contents.
The effective remaining waiting time is

    tremaining = twait(current-cache, ad) - (now - tinit)



## Waiting Time Function

The waiting time determines admission order and shapes the contents of the ad cache.



The waiting time is

    w(ad) = E * 1 / (1 - c/C)^Pocc * ( c(ad.service)/c + score(ad.IP) + G )

where:

- `E` be the advertisement expiry duration
- `C` be the ad cache capacity
- `c` be the current number of ads in the cache
- `c(ad.service)` be the number of cached ads for the same service as `ad`
- `score(ad.IP)` be the IP similarity score of the advertiser
- `Pocc` be the occupancy exponent
- `G` be the safety constant

### IP Similarity

Registrars maintain a binary tree over the IP addresses of admitted advertisements.
Each vertex stores a counter, and edges correspond to consecutive bits in the IP address.
For IPv4, the tree has 32 levels below the root.
To score an IP address, the registrar walks the tree along the address bits.
At each level, it compares the observed counter against the counter expected in a perfectly balanced tree. Prefixes that are overrepresented contribute to the score.
The resulting IP similarity score is normalized to the interval `[0,1]`.


## Waiting Time Lower Bound
Discv5 enforces a waiting time lower bound. 
A new waiting time must not improve on the old one by more than the elapsed time since the old ticket was issued.
Registrars keep lower-bound state only for bounded structures:

- per-service lower bounds for services already present in the cache
- per-prefix lower bounds in the IP tree

When service s enters the cache for the first time, `bound(s)` is set to `0`, and a `timestamp(s)` is set to the current time.
When a ticket request arrives for the same service `s`, the registrar calculates the service waiting time `ws` and returns the value `ws = max(ws , bound(s) − timestamp(s))`.
The bound and the timestamp are updated when a new ticket is issued and `ws > (bound(s) − timestamp(s))`.

For IP addresses in the IP tree structure, the state for an IP address is maintained at the node, which corresponds to the longest prefix match in the existing tree (without
introducing new nodes).
The advertiser also aggregates the lower bound states of multiple IPs mapping to the same node by applying a `max` function.


<!-- ## Ad Cache

The ad cache is the registrar's local storage of admitted advertisements.

Properties of the ad cache:

- fixed capacity `C`
- each entry expires after duration `E`
- at most one active advertisement per service and advertiser at a registrar
- admission order is controlled by waiting times rather than replacement policy

Implementations may maintain additional indices for efficient retrieval by service, expiration, advertiser, and IP prefix. -->



## Parameters

Discv5 uses the following main parameters:

- `Kregister`: target number of active or pending registrations per bucket
- `Klookup`: maximum number of registrar queries per bucket during lookup
- `Freturn`: maximum number of ENRs returned by one registrar response
- `Flookup`: target number of distinct advertisers to collect before terminating lookup
- `E`: advertisement expiry duration
- `C`: ad cache capacity
- `δ`: registration window duration
- `Pocc`: occupancy exponent used in the waiting-time function
- `G`: safety constant used in the waiting-time function

The concrete values belong in the wire or protocol-parameters document.

## Implementation Considerations

### ENR Freshness

Advertisers should send their current ENR in [REGservice]. Registrars should store the ENR
that was accepted for the service and return ENRs in [serviceNODES].

### Distinct Advertisers

Lookup should count distinct advertisers, not raw ENR count. Multiple registrars may return
the same advertiser.

### Signature Validation

The implementation uses ENRs as the advertised node object. Since ENRs are self-signed,
registrars and discoverers should validate returned ENRs according to the ENR rules before
using them.

### Clocks

The protocol does not require clock synchronization between advertiser and registrar.
Tickets carry registrar-generated timing information, and the advertiser only needs to wait
for the reported duration.

### Response Splitting

[REGCONFIRMATION] and [serviceNODES] contain `RespCount`, indicating that a logical response
may span multiple packets. Implementations should collect all responses belonging to the
same `ReqID` until the announced count is reached or the request times out.

## TODOs


1. exact ticket encoding and signature format
2. exact rules for deriving the service from higher-level service identifiers
3. exact encoding of additional neighbor ENRs associated with `Buckets`
4. whether any application-specific payload besides ENR is part of an advertisement
5. parameter defaults for `Kregister`, `Klookup`, `Freturn`, `Flookup`, `E`, `C`, `δ`,
   `Pocc`, and `G`

## References

[EIP-778]: ../enr.md
[REGservice]: ./discv5-wire.md#regservice-request-0x09
[REGCONFIRMATION]: ./discv5-wire.md#regconfirmation-response-0x0a
[serviceQUERY]: ./discv5-wire.md#servicequery-request-0x0b
[serviceNODES]: ./discv5-wire.md#servicenodes-response-0x0c
[NODES]: ./discv5-wire.md#nodes-response-0x04