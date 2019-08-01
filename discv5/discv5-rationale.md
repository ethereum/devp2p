# Node Discovery Protocol v5 - Rationale

**Draft of January 2019**

Note that this specification is a work in progress and may change incompatibly without
prior notice.

This document attempts to list the different requirements and security needs on the
discovery mechanisms and relate these through a design rationale to a new wire protocol
description.

In addition, this document tries to gather the various vulnerabilities and threats that
pertain to Kademlia-like p2p networks into a set of security requirements. One aim is to
make it plain which vulnerabilities are addressed and how they are mitigated, so that and
its completeness may be verified.

The document is structured as the list of requirements, followed by example protocol
conversation/scenarios that highlight the requirements they address, defining protocol
spec requirements and implementation recommendations separately. The separation is done
because some aspects (such as optional features enabled by a runtime configuration flag)
can't be mandated by the protocol spec.

There is also a placeholder to include notes on what uncertainties could be further
clarified using simulations. This could be used to help drive simulation development. (It
would be of real benefit if a reliable network simulation existed, to be maintained along
with the protocols, to help find weaknesses or answer any other questions about planned or
current network behavior.)

# Requirements

## Basic Goals

#### 1.1.1 Replacing V4 Endpoint Proof

The existing mutual endpoint verification process is difficult to reliably implement.

#### 1.1.2 Improve message verification

Make it expensive to obtain the logical node ID from discovery communications. Right now
an unknown UDP sender can provoke responses knowing IP alone, and obtain information about
the node without knowing the destination node ID.

#### 1.1.3 Support mixed ID types

Ensure the design offers the flexibility required by ENR forward compatibility proposals.
These will allow identity cryptosystems other than *secp256k1/keccak256*.

#### 1.1.4 Replace node information tuples with ENRs

ENRs include discovery information and more. These signed, versioned records fulfill
multiple requirements, such as permitting capability advertisement and transport
negotiation.

#### 1.1.5 Strengthen Kademlia node compatibility

Discovery v4 'trusts' other nodes to return neighbours according to an agreed distance
metric. Mismatches can make it hard for nodes to join the network, or lead to network
fragmentation.

#### 1.1.6 Secondary topic-based node index

The protocol must support discovery of nodes via an arbitrary topic identifier. Finding
nodes belonging to a topic should be as fast or faster than finding a node with a certain
ID.

#### 1.1.7 Change replay prevention

Timestamps as a replay prevention mechanism have led to problems with time
synchronisation. This must be replaced with a mechanism independent of the clock.

#### 1.1.8 Message obfuscation

The protocol must offer a basic type of message obfuscation preventing accidental packet
mangling or trivial sniffing. The protocol must support extensibility with new obfuscation
algorithms. It must also avoid inclusion of obvious markers to allow for future DPI
evasion capabilities.

## Security Goals

Individual potential vulnerabilities are identified below. These each represent their own
risk mitigation goal.

#### 1.2.1 Replay neighbours

A FindNode response (neighbours), if successfully replayed, would pollute the routing
table with stale information.

#### 1.2.2 Replay "I Am"

A 'Who Are You?' response, if successfully replayed from an older session, would allow a
malicious node to occupy a former IP location, or pollute the routing table with old
information.

#### 1.2.3 Kademlia redirection

A FindNode response contains false endpoint information intended at directing traffic at a
victim / polluting the routing table. A topic query results in fake endpoint information,
directing traffic at a victim.

#### 1.2.4 Kademlia redirection + self-propagation

As 1.2.3 but the responses attempt to replicate the malicious node throughout the routing
table, to amplify the source of pollution and traffic.

#### 1.2.5 Unsolicited replies

A malicious node is attempting to spam a node with fake responses to typical requests.
These messages may be replayed from previous communications, or may be new messages with
spoofed source endpoints. The aim is to disrupt weak implementations or have their
information be received as authentic, to pollute the recipient's routing table.

#### 1.2.6 Amplification

Malicious requests of small message size are sent from spoofed source IPs to direct larger
response messages at the victim.

#### 1.2.7 Kademlia direct validation

Direct validation of a newly discovered node can be an attack vector. A malicious node may
supply false node information with the IP of a victim. Validation traffic is then directed
at the victim.

#### 1.2.8 Kademlia ID count per address validations

There are various attacks facilitated by being able to associate multiple fake (or even
real) malicious node ids with a single IP endpoint. One mitigation method that is
sometimes considered is to globally limit the number of logical node IDs that can be
associated with an IP address. However, this is an attack vector. A malicious actor can
supply many logical node ids for a single IP address and thus prevent the correct node
from being able to join the network.

#### 1.2.9 Sybil/Eclipse attacks

These attacks rely on being able to create many real nodes, or spoof many logical node IDs
for a small number of physical endpoints, to form a large, isolated area of the network
under the control of the malicious actor. The victim's discovery findings are directed
into that part of the network, either to manipulate their traffic or to fully isolate them
from the network.

## Version Interoperability / Upgrade Paths

There are several considerations regarding the coexistence of v4 and v5 network members.

#### 1.3.1 Transition period network formation

Discovery v4 clients should serve as discovery v5 bootstrap nodes the number of new
discovery v5 clients is still low.

#### 1.3.2 Avoid circumvention of 1.1.2

While a client supports both the old v4 and newer versions, it is possible for malicious
actors to pose as a v4 node and recover node IDs from arbitrary IP addresses. This should
somehow be avoided.

#### 1.3.3 Support unobfuscated messages

Plain messages from v4 nodes should be handled as normal when the recipient node opts in
to support v4 peers. Obfuscated messages should be formed in such a way that they are
silently ignored by v4 recipient nodes, without affecting the reputation of the sender.

#### 1.3.4 Open up support for other transports

In the future, nodes should be able to use other transports than UDP.

# Scenarios

## Node Joining Network (Kademlia bootstrap)

In this scenario, node `A` joins the network using node `B` as a 'bootstrap node'.

1. **Node `A` gets initial ENR**

    The initial ENR may be a predefined bootnode, known peer (from previous connections),
    manually added peer, or manually specified bootnode. ‘Initial ENR’ means the id of the
    node that first leads to node `A` joining the network.
    The initial node must be also available from the command line (eg: --bootnodes) or via
    RPC. If there are already α nodes available, then all of those may be considered
    initial nodes and run concurrently. ENRs are signed by the issuer. So, to support
    command line or RPC addition of ENR records, those APIs or user interfaces may need
    extension to accept an ENR. (Helps **mitigate 1.2.3** by making it harder to add fake
    data into a client routing table.)

2. **Node `A` begins bootstrap process**

    Calculate the distance, `d`, between node `A`’s ID and the node `B`'s ID.

3. **Node `A` calls findnode on node `B`**

    Request nodes from the bucket covering distance `d`.

    **Addresses 1.1.5.**

4. **Node `B` starts handshake because node `A` is unknown caller**

    At this point there is no message that can be sent back to the caller, such as WhoAreYou
    as part of a verification process. All messages are signed. This would reveal to the
    caller the node’s public key based on IP address alone. So, FindNode must also accept
    the node ID of the recipient (bootnode in this case) as a parameter.

    Bootnode verifies that the intended recipient node ID is itself.

    **Addresses 1.1.2**

5. **Node `B` calls `WhoAreYou` on Node `A`**

    Bootnode responds with a `WhoAreYou` to verify the caller node. The IP address is taken
    from the packet; there is no source information in the message. The message must be
    small to prevent amplification: **Mitigates 1.2.6**

    For the same reasons as with FindNode, the WhoAreYou message must accept the intended
    recipient **(1.1.2)**. The node id is recovered from the message signature and used to
    call WhoAreYou.

6. **Node `A` replies with `IAm`**

    Node `A` verifies that the intended recipient is itself. It then recovers the node
    ID from the WhoAreYou request and verifies that it is already known and that the
    response endpoint is correct. (**Mitigates 1.2.6**)

    Node `A` retrieves its own signed ENR describing itself and sends it as an “I am”
    response.

7. **Node `B` verifies record of Node `A`**

    The ENR node ID is checked against the recovered IDs. However, there is no guarantee
    that the IP address contained in the ENR matches that of the UDP frame. There are
    networking scenarios where NAT supplies one ephemeral endpoint while that member is
    listening on another.

    Verification of the source data in the ENR must **mitigate 1.2.7** and **1.2.8**.
    Further, the verification must take into consideration that nodes may have moved from
    one IP address to another, and that some IP addresses will have clients with new node
    ids, legitimately. The solution proposed here is to limit the number of node IDs per
    endpoint per learned-from source.

8. **Node `B` adds ENR to routing table**

    At this point, the ENR is entered into the routing table. The ENR is considered
    validated and Node `A` has joined node `B`’s table if it has space available.

9. **Node `B` sends `Neighbors` response to Node `A`**

    node `B` now considers the original request (1) a valid request and Node `A` is
    sent a Neighbors response, which contains the ENRs belonging to the requested bucket.

10. **Node `A` verifies `Neighbors` response**

    Verification of the source data in the ENR must **mitigate 1.2.7** and **1.2.8** (see
    implementation requirements below).

    N.B.: At this point the returned nodes are added into the table and become candidates
    for eviction (see ‘aliveness checks’), or may be evicted if chosen as a member of
    α below.

11. **Repeat process on closest nodes**

    α of the closest nodes to the desired target (self in this case) are selected and the
    process repeated with concurrent `FindNode` calls to those members.

### Protocol Requirements

- `FindNode` should accept a specific bucket as the parameter to avoid revealing the lookup
  target.
- `FindNode` should accept the recipient's ID as a parameter to address requirement 1.1.2.
- `WhoAreYou` messages should not be much larger, if at all, than the `FindNode` message,
  to prevent amplification attempts.
- `WhoAreYou` should also include the recipient's own IDD as a parameter.

### Implementation Requirements

- A `FindNode` call that is followed by a `WhoAreYou` should be implemented as a single
  conversation, not as concurrent request-replies. This is because a 'standalone'
  `WhoAreYou` responds with a fairly large `IAm` message, opening opportunities for
  amplification attacks.
- Other methods of inserting node information into the routing table using *enode* IDs
  might not be adequate. Information about if the node is v4 or v5 will be missing, while
  it will be trivial to populate the routing table with invalid information.
- If `FindNode` is received with an invalid intended destination *node ID,* these should
  be ignored without response to avoid revealing any information about the recipient, but
  repeated occurrences of such messages could indicate the caller is the victim of having
  its routing table polluted. In future, this information could be perhaps used to trace
  the source.

## Malicious Node in Lookup Process

Continuing from the above, node `A` contacts the found node `M` which is malicious.

1. **Node `A` calls `FindNode` on `M`**

   Request nodes from the bucket covering distance `d`.

2. **Node `M` responds with `Neighbors`**

   An important observation is that because of the wide bit range of node IDs, most IDs
   are distant from each other. In other words, most nodes will be found in the top few
   k-buckets of each other. `FindNode` calls will most likely request the contents in the
   top 6 or 7 buckets, the overwhelming majority being for top bit. Because of this, it is
   fairly easy for a malicious actor to generate EC key pairs at random, whose hash (the
   Kademlia id) will be in those ranges. This means that a malicious actor will have no
   trouble generating many fake ENRs, correctly signed and placed in the correct k-bucket,
   bypassing k-bucket verification.

   What is much harder to do is control very many physical IP addresses. At this point,
   the malicious node can attempt several attacks:

   - Return many fake, signed ENRs, all or mostly pointing to this malicious node’s IP
     endpoint, in the hope of eclipsing the caller.
   - Return many fake, signed ENRs, with random IP addresses, in the hope of polluting the table.
   - Return many fake, signed ENRs, with many IP DDoS targets
   - Return many fake, signed ENRs, with IP addresses pointing at a DDoS victim.

3. **Node `A` verifies `Neighbors` response**

   As described in the previous section, most `FindNode`-based attacks will be based on
   responding with made-up node information. A certain factor must be decided for the
   system, which limits the number of logical node IDs for a physical endpoint address
   learned from a specific source.

   - If too few IPs are used in the response, the malicious node’s responses will fail the
     check, responses will be ignored, and node `M` evicted from the table.
   - If IPs in the response are non-existent, some of the nodes will become rejected in
     the following FindNode call, while ‘aliveness checks’ will evict the remainder.

### Implementation Recommendations

- A factor must be decided (as described above) that limits number of logical node IDs
  for a physical endpoint address learned from a specific source. \*\** It must balance
  serving as a deterrent while permitting multiple legitimate nodes behind NAT.
- The table must maintain a learned-from property per ENR. ENRs may be learned from
  multiple sources.
- If many nodes returned by node `M` fail subsequent FindNode attempts (selections from
  that list may be applied to multiple iterations of the lookup process), then the learned-from
  property will be used to remove all entries originating from that source and evict that
  learned-from node from the table.
- ENRs may be rediscovered from different sources, so implementations should strive to
  maintain a blacklist of evicted malicious nodes.
- If the malicious actor is attempting to pollute the DHT with junk, then node `A` is at
  risk of *receiving a FindNode request from a 3^rd^ bona-fide node* and redistributing
  the junk nodes to the bona-fide node, causing **eventual loss of reputation for node `A`
  and possible network expulsion**. The plus though is that there is strong incentive for
  nodes to validate `Neighbors` responses. However, because of vulnerability 1.2.7 and DoS
  attack risks direct validations should be avoided. Some studies (eg: [this
  one](https://engineering.purdue.edu/~isl/TR-EE-07-13.pdf)) recommend combining methods
  to validate the nodes. These strategies may include:

  - Exclude unvalidated nodes from Neighbors responses and defer validation until the
    protocol 'naturally' confirms them through `Ping` and `FindNode` calls.
  - Wait for multiple corroborations of the node, for some number of matching ENRs
    returned from multiple sources, weighting the factor to balance between faster
    propagation times and an increased likelihood of `Ping`/`FindNode` confirmation.
  - Schedule direct validation of all new ENRs over a longer period to avoid DDoS of
    multiple targets, while omitting unvalidated nodes from `Neighbor` responses.
  - A combination of the above.

> The approach should most likely involve avoiding redistribution of
> unvalidated nodes, but simulation would benefit here \*\*

## Aliveness Checks

The discovery protocol should periodically ping nodes or call `FindNode` to refresh
buckets and check for aliveness. These checks ensure that members of the node table are
responsive.

### Protocol Requirements

- `Ping` packet format must inclue the destination node ID to allow distinguishing
  between offline nodes and nodes which j

### Implementation Notes / Requirements

- `Pong` will only be sent if the incoming Ping matches the recipient's *node ID.*
  **Addresses 1.1.2**

- Ping failure (pong timeout) must cause a loss of ENR learned-from reputation and
  eventual expulsion, and deletion of the Ping target (and potentially all records from
  the same source) from the table.

## v4 Node Attempts Bonding Process on v5 Node

If a v5 Node can respond with a signed v4 Pong to a v4 Ping, then no mitigation of
**1.1.2** is available. However, if the v5 Node rejects v4 Pings, then the *Bonding*
process will fail and new v5 Nodes will not be able to join the network. **Partially
addresses 1.3.**

#### Implementation Recommendations

Implementations of v5 should continue to support v4 by default.

## v4/v5 Interoperability

Discovery v4 and v5 are distinct networks. However, since both systems support ENR,
records from v4 can be relayed in v5. The v4 network can also be used as a bootstrapping
system for v5. In the following scenario, a v5 node (`A`) joins the network using a v4
node (`B`) which supports [EIP-868].

1. **`A` sends v4 ping to `B`**

    This is needed to start the v4 endpoint proof procedure. `A`s ping should
    include its current ENR sequence number.

2. **`B` sends v4 pong and pings back**

    The pong indicates support for EIP-868 by listing `B`s ENR sequence number.

3. **`A` sends v4 pong to `B`**

    This completes the v4 endpoint proof.

4. **`A` requests `B`s ENR using the EIP-868 enrRequest message**

5. **`B` responds with ENR**

    The ENR sent by `B` is authenticated against `B`s node key. Support for discovery v5 is
    announced through a key/value pair in the record.

6. **`A` calls v5 `FindNode` on `B`**

    This is possible because `A` now knows that `B` understands v5.

### Protocol Requirements

- ENRs exchanged must include a key/value pair describing the supported protocol version.
- The v5 packet format must be recognizable and must not match the v4 format.

### Implementation Recommendations

- Implementations must be able to run both v4 and v5 on the same port and be able to
  distinguish packets of both protocol versions.

**Partially addresses 1.3.**

## Obfuscation

The above points explain that nodes should implement both v4 and newer versions of
Discovery, using indicators from either the stored ENR or packet format to determine which
protocol type to use.

While v5 nodes permit it, incoming messages that are not obfuscated should be readable and
should generate plain responses.

Accidental attempts at calling `FindNode` or sending other v5 messages to a v4 client
should not cause any loss of network reputation but should cause v4 nodes to silently fail
when the message is received. Forward compatibility should be in place to allow for
modifications to the obfuscation method.

### Protocol Requirements

- The wire format should handle plain (unobfuscated) messages.
- The incoming obfuscation type (plain, or otherwise..) determines the obfuscation
  response type. This allows for per-session or per-RPC modification of the obfuscation
  type.
- Forward compatibility may allow for multiple obfuscation types:
  - XOR with some value
  - Pad Packets
  - Random Truncation
  - Other algorithms targeted at DPI
- Header (hash and message signature) need not be obfuscated as the data is near random.
- Any parameters to the obfuscation algorithm are known/supplied as part of the
  transmission.

### Implementation Notes / Requirements

- ENR descriptors should indicate that the node is v4 and requires a plain message.
- In future, to confuse DPIs, one obfuscation type may be "ignore the next N packets,
  which will have random packet-types" to change the entropy of the packet-type byte.
- A runtime configuration option indicating whether unexposed traffic is supported may be
  added.

**Addresses 1.1.8.**

## Packet Replay

The expiration field used to detect replay attempts has been a source of difficulty
because nodes are often slightly out of time synchronization. The replacement mechanism
proposed involves the use of a 'conversation nonce'. Conversation Nonce is explained in
the [wire protocol specification].

Generally, replay scenarios are where a malicious actor attempts to disrupt a conversation
or pollute the routing tables by replaying messages obtained from eavesdropping older
communications. For example, if a `Neighbors` message containing old information is
successfully replayed back to a `FindNode` requester, at best the requester's routing
table would be polluted, at worst the intended recipient of the `FindNode` request could
lose reputation. A similar scenario applies for `WhoAreYou` / `IAm`.

**TBD: add scenario where replayed FindNode is rejected.**

#### Protocol Requirements

- The conversation nonce is used throughout a conversation, which is an exchange of
  messages between nodes. A simple request-reply call is also a conversation.
- The initiator of a conversation supplies the conversation nonce as part of the message,
  which is used in the reply or in any potential future more complex conversations.

**Mitigates 1.2.1 and 1.2.2.**

### Topic Advertisement Request

The topic discovery proposal involves registering advertisements that nodes support
certain abstract 'topics,' and offers a mechanism for discovering nodes via those
advertisements. New packets must be added to support registering for a topic and querying
the topic table.

#### Protocol Requirements

- All the new request packets must include the target node ID and the conversation nonce
  in order to **mitigate 1.2.1 and address 1.1.2**

- TopicQuery need not return node IDs.
  - It is possible to direct the subsequent lookup to malicious endpoints or generally
    produce a lot of lookup traffic that never converges.
  - TopicQuery returning *node IDs* places a requirement on the `FindNode` process that
    it must converge on the *ID*. This is not guaranteed until simulations confirm that
    the new `FindNode` variant does indeed behave reliably. \*\*
  - Proposals elsewhere in this document describe that discovered ENRs should be
    restricted according to a count of logical ids per IP per learned-from source. These
    mitigations ensure that TopicQuery can return ENRs directly, so long as those are
    validated according to the same criteria.
- The request-reply calls here all return large packets. To avoid amplification the
  calling node must be known, so the recipient node must initiate a `WhoAreYou` check to
  the caller (as in `FindNode`). As with `FindNode` the same determination must be made if
  `WhoAreYou`/`IAm` returns a large enough packet to be an amplification source itself, in
  which case the `WhoAreYou`/`IAm` check must be considered an integral part of the
  `TopicQuery`-related conversations using the same conversation nonce.
- A limit to the number of records in `TopicQuery` should be adopted.

### Implementation Recommendations

- ENRs returned by `TopicQuery` should be validated as though they were discoveries.
- ENRs returned by `TopicQuery` may be added into the Kademlia routing table.

## Mixing Identity Schemes

The 'id' used in the wire protocol is a 32 byte ID. Currently this is the hash of the
64-byte secp256k1 identity. This scheme may change, and nodes may even eventually have
multiple public keys. The ENR will eventually include additional dictionary entries to
specify the node ID directly and/or how to obtain it from a public key.

**TBD Add scenario containing two nodes with different identity schemes.**

# Simulation Notes Placeholder

Throughout the document wherever the \*\* reference is shown, a note regarding network
simulation can be found.

These are collated here, where any new simulation requirements can be added.

The aim is that for validation of changes or for a deeper understanding of threats and
network behaviors, these notes can serve as a set of requirements for development of a
network simulations.

- Determine factor limiting the number of logical node IDs per IP endpoint per
  learned-from source.
- Balance this factor against legitimate NAT scenarios.
- If a `Neighbours` response includes junk ENRs, work out a balance between validating
  them and timely redistribution of such information.
- If `TopicQuery` is to return node IDs rather than ENRs, then verify that the new
  `FindNode` method allows a look-up process to reliably converge on that node ID.
- Check network behavior with different message sizes to balance reliability with MTU.
- Check that topic advertisements don't easily allow scraping of node IDs with their IP
  endpoints (1.1.2) If they do, work out the best balance for a limit on `TopicQuery`
  response node list lengths.

[wire protocol specification]: ./discv5-wire.md
[EIP-868]: https://eips.ethereum.org/EIPS/eip-868
