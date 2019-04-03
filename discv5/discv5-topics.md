# Topic Advertisement in Discovery v5

Note that this specification is a work in progress and may change incompatibly without
prior notice.

The Topic Advertisement system is a part of Node Discovery v5. A node's provided services
are identified by arbitrary strings called *topics*. Depending on the needs of the
application, a node can advertise multiple topics or no topics at all. Every node
participating in the discovery DHT acts as an advertisement medium, meaning that it
accepts topic registrations from advertising nodes and later returns them to nodes
searching for the same topic.

## Motivation

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

## Specification

### Topic Advertisement Storage

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

```text
target-ad-lifetime = 600 # how long ads stay queued (10 min)
target-registration-interval = target-ad-lifetime / queue-length
min-wait-period = 60 # (1 min)
control-loop-constant = 600

period = time-of-registration - time-of-previous-registration
new-wait-period = wait-period * exp((target-registration-interval - period) / control-loop-constant)
wait-period = max(new-wait-period, min-wait-period)
```

### Advertisement Protocol

Let us assume that node `A` advertises itself under topic `T`. It selects node `C` as
advertisement medium and wants to register an ad, so that when node `B` (who is searching
for topic `T`) asks `C`, `C` can return the registration entry of `A` to `B`.

Node `A` first tells `C` that it wishes to register by requesting a ticket for topic `T`.
`C` replies with a ticket. The ticket contains the node identifier of `A`, the topic, a
serial number and wait period assigned by `C`.

Node `A` now waits for the duration of the wait period. When the wait is over, `A` sends a
registration request including the ticket. `C` does not need to remember its issued
tickets, just the serial number of the latest ticket accepted from `A` (after which it
will not accept any tickets issued earlier).

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

### Topic Search

Finding nodes that provide a certain topic is a continuous process which reads the content
of topic queues inside the approximated topic radius. Nodes within the radius are
contacted with [TOPICQUERY] packets. Collecting tickets and waiting on them is not
required. The approximated topic radius value can be shared with the registration
algorithm if the the same topic is being registered and searched for.

To find nodes, the searcher generates random node IDs inside the topic radius and performs
recursive Kademlia lookups on them. All (intermediate) nodes encountered during lookup are
asked for topic queue enties using the [TOPICQUERY] packet.

# Rationale

Topic search is not meant to be the only mechanism used for selecting peers. A persistent
database of useful peers is also recommended, where the meaning of "useful" is
protocol-specific. Like any DHT algorithm, topic advertisement is based on the law of
large numbers. It is easy to spread junk in it at the cost of wasting some resources.
Creating a more trusted sub-network of peers over time prevents any such attack from
disrupting operation, removing incentives to waste resources on trying to do so. A
protocol-level recommendation-based trust system can be useful, the protocol may even have
its own network topology.

## Security considerations

### Spamming with useless registrations

Our model is based on the following assumptions:

- Anyone can place their own advertisements under any topics and the rate of placing
  registrations is not limited globally. The number of active registrations at any time is
  roughly proportional to the resources (network bandwidth, mostly) spent on advertising.
- Honest actors whose purpose is to connect to other honest actors will spend an adequate
  amount of efforts on registering and searching for registrations, depending on the rate
  of newly established connections they are targeting. If the given topic is used only by
  honest actors, a few registrations per minute will be satisfactory, regardless of the
  size of the subnetwork.
- Dishonest actors (attackers) may want to place an excessive amount of registrations just
  to disrupt the discovery service. This will reduce the effectiveness of honest
  registration efforts by increasing the topic radius and/or the waiting times. If the
  attacker(s) can place a comparable amount or more registrations than all honest actors
  combined then the rate of new (useful) connections established throughout the network
  will reduce proportionally to the honest / (dishonest + honest) registration rates.

This adverse effect can be countered by honest actors increasing their registration and
search efforts. Fortunately, the rate of established connections between them will
increase proportionally both with increased honest registration and search efforts. If
both are increased in response to an attack, the required factor of increased efforts from
honest actors is proportional to the square root of the attacker's efforts.

### Detecting a useless registration attack

In the case of a symmetrical protocol (where nodes are both searching and advertising
under the same topic) it is easy to detect when most of the queried registrations turn out
to be useless and increase both registration and query frequency. It is a bit harder but
still possible with asymmetrical (client-server) protocols, where only clients can easily
detect useless registrations, while advertisers (servers) do not have a direct way of
detecting when they should increase their advertising efforts. One possible solution is
for servers to also act as clients just to test the server capabilities of other
advertisers. It is also possible to implement a feedback system between trusted clients
and servers.

### Amplifying network traffic by returning fake registrations

An attacker might wish to direct discovery traffic to a chosen address. This is prevented
by not returning endpoint details in the [TOPICNODES] message.

### Not registering/returning valid registrations

Although the limited registration frequency ensures that the resource requirements of
acting as a proper advertisement medium are sufficiently low, such selfish behavior is
possible, especially if some client implementations choose the easy way and not implement
it at all. This is not a serious problem as long as the majority of nodes are acting
properly, which will hopefully be the case. Advertisers can easily detect if their
registrations are not returned so it is probably possible to implement a mechanism to weed
out selfish nodes if necessary, but the design of such a mechanism is outside the scope of
this document.

[TOPICQUERY]: ./discv5-wire.md#TOPICQUERY
[TOPICNODES]: ./discv5-wire.md#TOPICNODES
