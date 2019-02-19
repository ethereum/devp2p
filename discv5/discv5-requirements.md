Discovery Wire Protocol
=======================

**Draft of January 2019**

Note that this specification is a work in progress and may change incompatibly
without prior notice.

Contents
========



[Discovery Wire Protocol](#discovery-wire-protocol)

[Contents](#contents)

[Overview](#overview)

[Requirements](#requirements)

> [Basic Goals](#basic-goals)
>
> [Security Goals](#security-goals)
>
> [Version Interoperability / Upgrade
> Paths](#version-interoperability-upgrade-paths)

[Scenarios](#scenarios)

> [Discovery v5 Node Joining Network (Kademlia
> bootstrap)](#discovery-v5-node-joining-network-kademlia-bootstrap)
>
> [Discovery Requirements](#discovery-requirements)
>
> [Implementation Notes /
> Requirements](#implementation-notes-requirements)
>
> [Malicious Node in Lookup
> Process](#malicious-node-in-lookup-process)
>
> [Implementation Notes /
> Requirements](#implementation-notes-requirements-1)
>
> [Aliveness Checks](#aliveness-checks)
>
> [Discovery Requirements](#discovery-requirements-1)
>
> [Implementation Notes /
> Requirements](#implementation-notes-requirements-2)
>
> [V4 Node Attempts Bonding Process on V5
> Node](#v4-node-attempts-bonding-process-on-v5-node)
>
> [Implementation Notes /
> Requirements](#implementation-notes-requirements-3)
>
> [V5 Node Wants to FindNode on V4
> Node](#v5-node-wants-to-findnode-on-v4-node)
>
> [Discovery Requirements](#discovery-requirements-2)
>
> [Implementation Notes /
> Requirements](#implementation-notes-requirements-4)
>
> [Obfuscation -- V4 Nodes or V5 Nodes Communicate with V5
> Node](#obfuscation-v4-nodes-or-v5-nodes-communicate-with-v5-node)
>
> [Discovery Requirements](#discovery-requirements-3)
>
> [Implementation Notes /
> Requirements](#implementation-notes-requirements-5)
>
> [Replay Scenarios](#replay-scenarios)
>
> [Discovery Requirements](#discovery-requirements-4)
>
> [Implementation Notes /
> Requirements](#implementation-notes-requirements-6)
>
> [Topic Advertisement
> Request](#topic-advertisement-request)
>
> [Discovery Requirements](#discovery-requirements-5)
>
> [Implementation Notes /
> Requirements](#implementation-notes-requirements-7)
>
> [Mixed ID Scenarios](#mixed-id-scenarios)

[\*\*Simulation Notes
Placeholder](#simulation-notes-placeholder)

Overview
========

This document attempts to list the different requirements and security
needs on the discovery mechanisms and relate these through a design
rationale to a new wire protocol description.

The basic goals are distilled from the [[discovery direction
page]](https://github.com/ethereum/devp2p/wiki/Discovery-Overview).
That in turn is driven by the various EIPs and protocol enhancements the
page references. In addition, this document tries to gather the various
vulnerabilities and threats that pertain to Kademlia-like p2p networks
into a set of security requirements. One aim is to make it plain which
vulnerabilities are addressed and how they are mitigated, so that and
its completeness may be verified.

This list is then referenced in the protocol descriptions below, those
references serving as a design rationale.

The document is structured as

-   the list of requirements,

-   followed by example protocol conversation/scenarios that highlight
    the requirements they address, defining wire protocol requirements
    and implementation notes, and

-   finally, the message format specification.

There is also a placeholder to include notes on what uncertainties could
be further clarified using simulations. This could be used to help drive
simulation development. (It would be of real benefit if a reliable
network simulation existed, to be maintained along with the protocols,
to help find weaknesses or answer any other questions about planned or
current network behavior.)

*A note on terminology:* In this document *message* is used to refer to
a Discovery message (such as *Ping*), whereas *packet* is used to refer
to the serialized data compartmentalized into a transport (particularly
*UDP*) frame. For example, the Neighbors reply *message* may be
transmitted in multiple *packets.*

Requirements
============

Basic Goals 
------------

Several basic needs were identified in the [[discovery direction
page]](https://github.com/ethereum/devp2p/wiki/Discovery-Overview).
Please refer to that document for details on their motivations. These
are reiterated below.

|        |                                        |                                                                                                                                                                                                                                                                                               |
|--------|----------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Id** | **Requirement**                        | **Summary**                                                                                                                                                                                                                                                                                   |
| 1.1.1  | Replace V4 bonding                     | The existing mutual endpoint verification process is difficult to reliably implement                                                                                                                                                                                                          |
| 1.1.2  | Improve message verification           | Make it expensive to obtain the logical node id from discovery communications. Right now an unknown UDP sender can provoke responses knowing IP alone, and obtain inf                                                                                                                         |
| 1.1.3  | Support mixed ID types                 | Ensure the design offers the flexibility required by ENR forward compatibility proposals. These will allow IDs other than *secp256k1*.                                                                                                                                                        |
| 1.1.4  | Replace tuples with ENRs               | ENRs include *discovery* information and more. These signed, versioned records fulfill multiple requirements, such as permitting *capability* advertisement.                                                                                                                                  |
| 1.1.5  | Strengthen Kademlia node compatibility | v4 discovery 'trusts' other nodes to return neighbours according to an agreed distance metric. Mismatches can make it hard for nodes to join the network, or lead to network fragmentation.                                                                                                   |
| 1.1.6  | Implement 'Topics'                     | The protocol must support topic registration and discovery                                                                                                                                                                                                                                    |
| 1.1.7  | Change replay prevention               | Timestamps as a replay prevention mechanism have led to problems with time synchronisation. This must be replaced.                                                                                                                                                                            |
| 1.1.8  | Message obfuscation                    | The protocol must offer a basic type of message obfuscation preventing accidental packet mangling or trivial sniffing. The protocol must support extensibility with new obfuscation algorithms. It must also avoid inclusion of obvious markers to allow for future DPI evasion capabilities. |
| 1.1.9  | Fast shard transitions                 | **TBD - Validators need to discover and join shard subnets quickly as attesters will be switching shards every \~7mins or so**                                                                                                                                                                |

Security Goals
--------------

Individual potential vulnerabilities are identified below. These each
represent their own risk mitigation goal.

|        |                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|--------|-------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Id** | **Requirement**                           | **Summary**                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.2.1  | Replay neighbours                         | A FindNode response (neighbours), if successfully replayed, would pollute the routing table with stale information                                                                                                                                                                                                                                                                                                                                                                 |
| 1.2.2  | Replay "I Am"                             | A 'Who Are You?' response, if successfully replayed from an older session, would allow a malicious node to occupy a former IP location, or pollute the routing table with old information                                                                                                                                                                                                                                                                                          |
| 1.2.3  | Kademlia redirection                      | A FindNode response contains false endpoint information intended at directing traffic at a victim / polluting the routing table. A TopicQuery results in fake endpoint information, directing traffic at a victim.                                                                                                                                                                                                                                                                 |
| 1.2.4  | Kademlia redirection + self-propagation   | As 1.2.3 but the responses attempt to replicate the malicious node throughout the routing table, to amplify the source of pollution and traffic                                                                                                                                                                                                                                                                                                                                    |
| 1.2.5  | Unsolicited replies                       | A malicious node is attempting to spam a node with fake responses to typical requests. These messages may be replayed from previous communications, or may be new messages with spoofed source endpoints. The aim is to disrupt weak implementations or have their information be received as authentic, to pollute the recipient's routing table.                                                                                                                                 |
| 1.2.6  | Amplification                             | Malicious requests of small message size are sent from spoofed source IPs to direct larger response messages at the victim.                                                                                                                                                                                                                                                                                                                                                        |
| 1.2.7  | Kademlia direct validation                | Direct validation of a newly discovered node can be an attack vector. A malicious node may supply false node information with the IP of a victim. Validation traffic is then directed at the victim.                                                                                                                                                                                                                                                                               |
| 1.2.8  | Kademlia id count per address validations | There are various attacks facilitated by being able to associate multiple fake (or even real) malicious node ids with a single IP endpoint. One mitigation method that is sometimes considered is to globally limit the number of logical node IDs that can be associated with an IP address. However, this is an attack vector. A malicious actor can supply many logical node ids for a single IP address and thus prevent the correct node from being able to join the network. |
| 1.2.9  | Sybil/Eclipse attacks                     | These attacks rely on being able to create many real nodes, or spoof many logical node IDs for a small number of physical endpoints, to form a large, isolated area of the network under the control of the malicious actor. The victim's *discovery* findings are directed into that part of the network, either to manipulate their traffic or to fully eclipse them from the network.                                                                                           |
| 1.2.10 | Shard validator anonymity                 | **TBD - Preserve validator anonymity. Prevent validators from being the focus of attacks.**                                                                                                                                                                                                                                                                                                                                                                                        |

Version Interoperability / Upgrade Paths
----------------------------------------

There are several considerations regarding the coexistence of Discovery
v4 and new Discovery network members.

|        |                                      |                                                                                                                                                                                                                                                                        |
|--------|--------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Id** | **Requirement**                      | **Summary**                                                                                                                                                                                                                                                            |
| 1.3.1  | Transition period network formation  | Discovery v4 clients and new Discovery clients should be able to form a network while the number of new Discovery clients is still low.                                                                                                                                |
| 1.3.2  | Avoid circumvention of 1.1.2         | While a Discovery client supports both the old v4 and newer versions, it is possible for \[malicious\] actors to pose as a v4 node and recover node IDs from arbitrary IP addresses. This should somehow be avoided.                                                   |
| 1.3.3  | Support unobfuscated messages        | Plain messages from v4 nodes should be handled as normal when the recipient node opts in to support v4 peers. Obfuscated messages should be formed in such a way that they are silently ignored by v4 recipient nodes, without affecting the reputation of the sender. |
| 1.3.4  | Open up support for other transports | In future, nodes should be able to apply Discovery of other transports than UDP. It should be possible to run Discovery over TCP and TOR for example.                                                                                                                  |

Scenarios
=========

### ![#00f015](https://placehold.it/15/00f015/000000?text=+) Discovery v5 Node Joining Network (Kademlia bootstrap)

<table>
<thead>
<tr class="header">
<th>V5 Node</th>
<th>&lt;-&gt;</th>
<th>Bootnode</th>
<th>Notes</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>Get initial ENR (eg: bootnode).</td>
<td></td>
<td></td>
<td><p>The initial ENR may be a predefined bootnode, known peer (from previous connections), manually added peer, or manually specified bootnode. ‘Initial ENR’ means the id of the node that first leads to V5 Node joining the network.</p>
<p>The initial node must be also available from the command line (eg: --bootnodes) or via RPC AddPeer.</p>
<p>If there are already <em><strong>α</strong></em> nodes available, then all of those may be considered initial nodes and run concurrently.</p>
<p>ENRs are signed by the issuer. *</p>
<p>So, to support command line or RPC addition of ENR records, those APIs or user interfaces may need extension to accept an ENR.</p>
<p>(Helps <strong>mitigate</strong> <strong>1.2.3</strong> by making it harder to add fake data into a client routing table.)</p></td>
</tr>
<tr class="even">
<td>Begin bootstrap process</td>
<td></td>
<td></td>
<td>Calculate the distance, <em>d</em>, between V5 Node’s Kademlia ID and the Bootnode’s Kademlia ID.</td>
</tr>
<tr class="odd">
<td>Call FindNode</td>
<td>-&gt;</td>
<td></td>
<td>Request nodes from the bucket covering distance <em>d</em>.<br />
<br />
<strong>Addresses 1.1.5.</strong></td>
</tr>
<tr class="even">
<td></td>
<td></td>
<td>Defer the response as this is an unknown caller. Begin verification of the caller.</td>
<td><p>At this point there is no message that can be sent back to the caller, such as WhoAreYou as part of a verification process. All messages are signed. This would reveal to the caller the node’s public key based on IP address alone.<br />
<br />
So, FindNode must also accept the <em>node ID</em> of the recipient (bootnode in this case) as a parameter.<br />
<br />
Bootnode verifies that the intended recipient <em>node</em> <em>id</em> is itself.</p>
<p><strong>Addresses 1.1.2</strong></p></td>
</tr>
<tr class="odd">
<td></td>
<td>&lt;-</td>
<td>Call WhoAreYou</td>
<td>Bootnode responds with a WhoAreYou to verify the caller node. The IP address is taken from the packet; there is no source information in the message.<br />
<br />
The message must be small to prevent amplification: <strong>Mitigates 1.2.6</strong><br />
<br />
For the same reasons as with FindNode, the WhoAreYou message must accept the intended recipient. <strong>(1.1.2)</strong> The node id is recovered from the message signature and used to call WhoAreYou</td>
</tr>
<tr class="even">
<td>“I am” ENR</td>
<td>-&gt;</td>
<td></td>
<td><p>V5 Node verifies that the intended recipient is itself.</p>
<p>V5 Node recovers the <em>node id</em> from the WhoAreYou request and verifies that it is already known and that the response endpoint is correct. <strong>Mitigates 1.2.6</strong><br />
<br />
V5 Node retrieves its own signed ENR describing itself and sends it as an “I am” response.</p></td>
</tr>
<tr class="odd">
<td></td>
<td></td>
<td>Verify ENR</td>
<td>The ENR <em>node id</em> is checked against the recovered ids.<br />
However, there is no guarantee that the IP address contained in the ENR matches that of the UDP frame. There are networking scenarios where NAT supplies one ephemeral endpoint while that member is listening on another.<br />
<br />
Verification of the source data in the ENR must <strong>mitigate 1.2.7</strong> and <strong>1.2.8.</strong> Further, the verification must take into consideration that nodes may have moved from one IP address to another, and that some IP addresses will have clients with new node ids, legitimately.<br />
The solution proposed here is to limit the number of <em>node IDs</em> per endpoint <em>per learned-from source</em>.</td>
</tr>
<tr class="even">
<td></td>
<td></td>
<td>Add ENR to routing table.</td>
<td>At this point, the ENR is entered into the routing table. The ENR is considered validated and <strong>V5 Node has joined Bootnode’s table.</strong></td>
</tr>
<tr class="odd">
<td></td>
<td>&lt;-</td>
<td>Neighbors response</td>
<td>Bootnode considers this a valid request and V5 Node is sent a Neighbors response, which contains the ENRs belonging to the requested bucket.</td>
</tr>
<tr class="even">
<td>Verify response and ENRs</td>
<td></td>
<td></td>
<td><p>Verification of the source data in the ENR must <strong>mitigate 1.2.7</strong> and <strong>1.2.8</strong> (see implementation requirements below).</p>
<p><em>N.B.</em>: At this point the returned nodes are added into the table and become candidates for eviction (see ‘aliveness checks’), or may be evicted if chosen as a member of <em><strong>α</strong></em> below.</p></td>
</tr>
<tr class="odd">
<td>Repeat process on closest nodes</td>
<td></td>
<td></td>
<td><em><strong>α</strong></em> of the closest nodes to the desired target (self in this case) are selected and the process repeated with concurrent FindNode calls to those members.</td>
</tr>
</tbody>
</table>

\* ENRs, while v4 interoperability is on, may be unsigned. This is
discussed later in the details on interoperability.

#### Discovery Requirements

-   FindNode should accept a specific bucket as the parameter.

-   FindNode should accept the recipient's own id as a parameter.

-   WhoAreYou messages should not be much larger, if at all, than the
    FindNode message, to prevent amplification attempts.

-   WhoAreYou should also include the recipient's own id as a parameter.

#### Implementation Notes / Requirements

-   A FindNode call that is followed by a WhoAreYou should be
    implemented as a single conversation, not as concurrent
    request-replies. This is because a 'standalone' WhoAreYou responds
    with a fairly large IAm message, opening opportunities for
    amplification attacks.

-   AddPeer or other methods of inserting node information into the
    routing table using *enode* IDs might not be adequate. Information
    about if the node is v4 or v5 will be missing, while it will be
    trivial to populate the routing table with invalid information.

-   If FindNode is received with an invalid intended destination *node
    ID,* these should be ignored without response to avoid revealing any
    information about the recipient, but repeated occurrences of such
    messages could indicate the caller is the victim of having its
    routing table polluted. In future, this information could be perhaps
    used to trace the source.

-   The set of ENR records returned from "I am" and "Neighbors" messages
    *must* be validated as not having more than a certain number
    (**TBD**) of logical *node IDs per learned-from source*. The limit
    could be quite low, for example 2 or 3 node ids per endpoint, but
    while this mitigates various attacks, a balance needs to be struck
    between denying legitimate NAT scenarios and protecting against
    multiple attackers working in concert. The best factor used here
    would best be answered using simulations. \*\*

### ![#00f015](https://placehold.it/15/00f015/000000?text=+) Malicious Node in Lookup Process

Continuing from the above, V5 Node contacts one of ***α*** nodes, which
is malicious.

<table>
<thead>
<tr class="header">
<th>V5 Node</th>
<th>&lt;-&gt;</th>
<th>Malicious node</th>
<th>Notes</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>Contact one of the <em>α</em> nodes</td>
<td></td>
<td></td>
<td>Calculate the distance, <em>d</em>, between V5 Node’s Kademlia ID and Malicious Node’s Kademlia ID.</td>
</tr>
<tr class="even">
<td>Call FindNode</td>
<td>-&gt;</td>
<td></td>
<td>Request nodes from the bucket covering distance <em>d</em>.</td>
</tr>
<tr class="odd">
<td></td>
<td>&lt;-</td>
<td>Neighbors response</td>
<td><p>An important observation is that because of the wide bit range of Ethereum Kademlia ids, <em>most Ethereum Kademlia ids are distant from each other.</em> In other words, most nodes will be found in the top few k-buckets of each other. FindNode calls will most likely request the contents in the top 6 or 7 buckets, the overwhelming majority being for top bit.</p>
<p>Because of this, it is fairly easy for a malicious actor to generate EC key pairs at random, whose hash (the Kademlia id) will be in those ranges. This means that a malicious actor will have no trouble generating many fake ENRs, correctly signed and placed in the correct k-bucket, bypassing k-bucket verification.</p>
<p>What is much harder to do is control very many physical IP addresses. At this point, the malicious node can attempt several attacks:</p>
<ol type="1">
<li><p>Return many fake, signed ENRs, all or mostly pointing to this malicious node’s IP endpoint, in the hope of eclipsing the caller.</p></li>
<li><p>Return many fake, signed ENRs, with random IP addresses, in the hope of polluting the table.</p></li>
<li><p>Return many fake, signed ENRs, with many IP DDoS targets</p></li>
<li><p>Return many fake, signed ENRs, with IP addresses pointing at a DDoS victim.</p></li>
</ol></td>
</tr>
<tr class="even">
<td>Verify response and ENRs</td>
<td></td>
<td></td>
<td><p>As described in the previous section, a certain factor must be decided for the system, which limits the <em>number of logical node IDs for a physical endpoint address learned from a specific source</em>.</p>
<p>For the above cases:</p>
<ol type="1">
<li><p>The Malicious node’s responses will contain too many ENRs with the same IP address, and the Malicious Node’s responses will be ignored, and Malicious Node evicted from the table.</p></li>
<li><p><em><strong>α</strong></em> of the nodes will become rejected in the following FindNode call, while ‘aliveness checks’ will evict the remainder.</p></li>
<li><p>Same as 2.</p></li>
<li><p>Same as 1.</p></li>
</ol>
<p>This <strong>mitigates 1.2.3, 1.2.4, 1.2.7 and 1.2.8 (see final implementation note below)</strong></p></td>
</tr>
<tr class="odd">
<td>Repeat process on closest nodes</td>
<td></td>
<td></td>
<td><em>α</em> of the closest nodes to the desired target (self in this case) are selected and the process repeated with concurrent FindNode calls to those members.</td>
</tr>
</tbody>
</table>

#### Implementation Notes / Requirements

-   A factor must be decided (as described above) that limits *number of
    logical node IDs for a physical endpoint address learned from a
    specific source. \*\** It must balance serving as a deterrent while
    permitting multiple legitimate nodes behind NAT.

-   The table must maintain a learned-from property per ENR. ENRs may be
    learned from multiple sources.

-   If many nodes returned by Malicious Node fail subsequent FindNode
    attempts (selections from that list may be applied to multiple
    iterations of ***α***), then the learned-from property will be used
    to remove all entries originating from that source and evict that
    learned-from node from the table.

-   ENRs may be rediscovered from different sources, so implementations
    should strive to maintain a blacklist of evicted malicious nodes.

-   **N.B.** If the malicious actor is attempting case 2, to pollute the
    DHT with junk, then V5 Node is at risk of *receiving a FindNode
    request from a 3^rd^ bona-fide node* and redistributing the junk
    nodes to the bona-fide node, causing **eventual loss of reputation
    for V5 Node and possible network expulsion**. The plus though is
    that there is strong incentive for nodes to validate Neighbor
    responses. However, because of vulnerability 1.2.7 and case 3 above
    direct validations should be avoided. Some studies (eg: [[this
    one]](https://engineering.purdue.edu/~isl/TR-EE-07-13.pdf))
    recommend combining methods to validate the nodes. These strategies
    may include

    -   Exclude unvalidated nodes from Neighbors responses and defer
        validation until Kademlia 'naturally' confirms them through Ping
        and FindNode calls.

    -   Wait for multiple corroborations of the node, for some number of
        matching ENRs returned from multiple sources, weighting the
        factor to balance between faster propagation times and an
        increased likelihood of Ping/FindNode confirmation.

    -   Schedule direct validation of all new ENRs over a longer period
        to avoid DDoS of multiple targets, while omitting unvalidated
        nodes from Neighbor responses.

    -   A combination of the above.

> The approach should most likely involve avoiding redistribution of
> unvalidated nodes, but simulation would benefit here \*\*

### ![#00f015](https://placehold.it/15/00f015/000000?text=+) Aliveness Checks

Kademlia periodically Pings nodes or calls FindNode to refresh buckets
and check for aliveness.

#### Discovery Requirements

-   Ping packet format must also include the intended *node ID*.

#### Implementation Notes / Requirements

-   V5 Pong will only be sent if the incoming Ping matches the
    recipient's *node ID.* **Addresses 1.1.2**

-   Ping failure (pong timeout) must cause a loss of ENR learned-from
    reputation and eventual expulsion, and deletion of the Ping target
    (and potentially all records from the same source) from the table.

### ![#00f015](https://placehold.it/15/00f015/000000?text=+)  V4 Node Attempts Bonding Process on V5 Node

If a V5 Node can respond with a signed V4 Pong to a V4 Ping, then no
mitigation of **1.1.2** is available. However, if the V5 Node rejects V4
Pings, then the *Bonding* process will fail and new V5 Nodes will not be
able to join the network. **Partially addresses 1.3.**

#### Implementation Notes / Requirements

-   V5 Nodes should continue to support V4 Discovery Protocol by default
    while a client execution flag allows, and until a future release
    when the protocol will be disabled by default.

### ![#00f015](https://placehold.it/15/00f015/000000?text=+) V5 Node Wants to FindNode on V4 Node 

This will not work on newly discovered nodes because V4 Nodes reject
calls from nodes who have not completed the *Bonding* process. However,
if V5 Nodes cannot progress with the bootstrapping process, they will
have a very hard time joining the network while migrations are ongoing.

Also, splitting the table into v5 and v4 tables causes the problem that
v5 nodes would either initially be sparse, or v4 nodes would eventually
be sparse, causing network formation problems.

#### Discovery Requirements

-   ENRs must maintain a property describing their version.

#### Implementation Notes / Requirements

-   Tuples obtained from v4 Nodes must be relayed as *unsigned* ENRs
    when V5 Neighbors packets are sent.

-   **TBD : Decide on upgrade path (have v4&v5 parallel dhts, or make v5
    temporarily support)**

-   Those ENRs must indicate that the version is v4 and that is why the
    signature is missing.

-   Depending on the ENR version, while v4 compatibility is enabled, the
    appropriate version of Discovery is used in communications.

-   An incoming V4 Ping packet (initiating a *Bonding* process) already
    specifies its version as 4 in the message body. This is used by V5
    nodes to recognize that the newly discovered incoming node should
    result in a v4 ENR.

**Partially addresses 1.3.**

### ![#00f015](https://placehold.it/15/00f015/000000?text=+)  Obfuscation -- V4 Nodes or V5 Nodes Communicate with V5 Node 

The above points explain that nodes should implement both v4 and newer
versions of Discovery, using indicators from either the stored ENR or an
incoming v4 Ping to determine which protocol type to use.

While V5 nodes permit it, incoming messages that are not obfuscated
should be readable and should generate plain responses.

Accidental attempts at calling FindNode or sending other V5 messages to
a V4 client should not cause any loss of network reputation but should
cause v4 nodes to silently fail when the message is received.

Forward compatibility should be in place to allow for modifications to
the obfuscation method.

#### Discovery Requirements

-   The wire format should handle plain messages

-   The incoming obfuscation type (plain, or otherwise..) determines the
    obfuscation response type. This allows for per-session or per-RPC
    modification of the obfuscation type.

-   Forward compatibility may allow for multiple obfuscation types:

    -   XOR with some value

    -   Pad Packets

    -   Random Truncation

    -   Other algorithms targeted at DPI

-   Header (hash and message signature) need not be obfuscated as the
    data is near random.

-   The top 3 bits of the packet type will represent the obfuscation
    type, allowing for v4 Nodes to silently fail obfuscated messages as
    unsupported (EIP-8)

-   Any parameters to the obfuscation algorithm are supplied as part of
    the transmission.

#### Implementation Notes / Requirements

-   ENR descriptors should indicate that the node is v4 and requires a
    plain message.

-   In future, to confuse DPIs, one obfuscation type may be "ignore the
    next N packets, which will have random packet-types" to change the
    entropy of the packet-type byte.

-   *Implementation recommendation: Add an execution flag indicating if
    to support unexposed traffic or not*

**Addresses 1.1.8**

### ![#00f015](https://placehold.it/15/00f015/000000?text=+)  Replay Scenarios

The expiration field used to detect replay attempts has been a source of
difficulty because nodes are often slightly out of time synchronization.

The replacement mechanism proposed here involves the use of a
'*conversation nonce'*.

*Conversation Nonce* is explained in the Wire Protocol section.

Generally, replay scenarios are where a malicious actor attempts to
disrupt a conversation or pollute the routing tables by replaying
messages obtained from eavesdropping older communications. For example,
if a Neighbors message containing old information is successfully
replayed back to a FindNode requester, at best the requester's routing
table would be polluted, at worst the intended recipient of the FindNode
request could lose reputation. A similar scenario applies for WhoAreYou
/ IAm.

#### Discovery Requirements

-   The *conversation-nonce* is used throughout a conversation, which is
    an exchange of messages between nodes. (A simple request-reply call
    is also a conversation. )

-   The initiator of a conversation supplies the conversation nonce as
    part of the message, which is used in the reply or in any potential
    future more complex conversations.

#### Implementation Notes / Requirements

-   The conversation nonce is explained in detail in the wire protocol
    section

**Mitigates 1.2.1 and 1.2.2**

### ![#00f015](https://placehold.it/15/00f015/000000?text=+) Topic Advertisement Request

The topic discovery proposal involves registering advertisements that
nodes support certain abstract 'topics,' and offers a mechanism for
discovering nodes via those advertisements. The original draft proposal
is referenced in the Discovery wiki page. **TBD:** This document will be
extended to include an updated topic discovery spec?

New packets must be added to support the RequestTicket, TopicRegister
and TopicQuery request-reply calls.

#### Discovery Requirements

-   All the new request packets must include the target *node ID* and
    the *conversation nonce* in order to **mitigate 1.2.1 and address
    1.1.2**

-   TopicQuery need not return *node IDs. *

    -   It is possible to direct the subsequent lookup to malicious
        endpoints or generally produce a lot of lookup traffic that
        never converges.

    -   TopicQuery returning *node IDs* places a requirement on the
        FindNode process that it must converge on the *ID*. This is not
        guaranteed until simulations confirm that the new FindNode
        variant does indeed behave reliably. \*\*

    -   Proposals elsewhere in this document describe that discovered
        ENRs should be restricted according to a count of logical ids
        per IP per learned-from source. These mitigations ensure that
        TopicQuery can return ENRs directly, so long as those are
        validated according to the same criteria.

    -   **TopicQuery here returns ENRs directly.**

    -   The request-reply calls here all return large packets. To avoid
        amplification the calling node must be known, so the recipient
        node must initiate a WhoAreYou check to the recovered id (as in
        FindNode). As with FindNode the same determination (**TBD**)
        must be made if WhoAreYou / IAm returns a large enough packet to
        be an amplification source itself, in which case the
        WhoAreYou/IAm check must be considered an integral part of the
        Topic conversations using the same *conversation nonce.*

    -   A limit to the number of records in TopicQuery should be
        adopted.

#### Implementation Notes / Requirements

-   As is stands, the Topic Discovery protocol draft still exposes a
    vulnerability to make topic registrations for many new topics, which
    each get fresh throttled FIFO queues at their minimum throttling
    rate. **This allows malicious actors to flood a node's global
    advertisement space**. Mitigation could be achieved in several ways:
    **TBD.**

-   **ENRs returned by TopicQuery should be validated as though they
    were discoveries. **

-   ENRs returned by TopicQuery may be handled as discoveries and passed
    for entry into the Kademlia routing table**.**

### ![#00f015](https://placehold.it/15/00f015/000000?text=+) Mixed ID Scenarios

The 'id' used in the wire protocol is a 32 byte id. Currently this is
the hash of the 64byte secp256k1 identity. This scheme may change, and
nodes may even eventually have multiple public keys. The ENR will
eventually include additional dictionary entries to specify the node id
directly and/or how to obtain it from a recovered public key.

\*\*Simulation Notes Placeholder
================================

Throughout the document wherever the \*\* reference is shown, a note
regarding network simulation can be found.

These are collated here, where any new simulation requirements can be
added.

The aim is that for validation of changes or for a deeper understanding
of threats and network behaviors, these notes can serve as a set of
requirements for development of \[a\] network simulations.

-   Determine factor limiting the *number of logical node IDs per IP
    endpoint per learned-from source.*

-   Balance this factor against legitimate NAT scenarios.

-   If a Neighbours response includes junk *ENRs*, work out a balance
    between validating them and timely redistribution of such
    information.

-   If TOPICQUERY is to return *node IDs* rather than *ENRs*, then
    verify that the new FINDNODE method allows a look-up process to
    reliably converge on that *node ID.*

-   Check network behavior with different message sizes to balance
    reliability with MTU.

-   Check that topic advertisements don't easily allow scraping of
    *node* *IDs* with their IP endpoints (1.1.2) If they do, work out
    the best balance for a limit on TOPICQUERY response node list
    lengths.

