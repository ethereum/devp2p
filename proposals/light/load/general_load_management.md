# Light Client Load-Management Review and Proposal

## Proposal Summary

This proposal reviews the current load-management mechanisms for light client servers, namely LES flow control and the proposed server capacity management, to offer a more general and simplified direction. The proposal focuses on modifications to light protocols to simplify client implementation and defining a commonly-agreed server throttling, eviction and costing configuration format.

If this gains traction, next steps would be to define the general format and some common control messages for evictions and throttling.

## Overview

There are a couple of documents floating around that have a go at specifying how ethereum 'light-client servers' should handle 'light-client' capacity and load:

1. A flow control [document](https://github.com/zsfelfoldi/go-ethereum/wiki/Client-Side-Flow-Control-model-for-the-LES-protocol)

2. A server rate limiting [document](https://gist.github.com/zsfelfoldi/8d1dfa05ce1e4b50ea5fe1573fb461d6)  

Parity Tech seems to have its own LES message spec too, but it says little about client/server rate limiting.

The rest of this file contains:

1. The TL/DR of my opinions/recommendations on this topic of _light_ server capacity regulation.

2. A summary of each of the above documents along with a collection of my opinions on the LES capacity management recommendations in the above two links.

The aim is to provide a review of the current proposals, get a bunch of people involved in discussions around this doc and adding issues on github, in the hope that all those people from different elements of the Ethereum community will quickly agree on a way forward for LES that is common to all implementations.

A note: 'client' can mean an Ethereum implementation or it can mean a light-client peer in a client-server role in the p2p network. Depends on context. We should come up with some better terminology.

## Proposal (TL/DR)

1. Server operators would most likely prefer to see a setup where they can specify their throttling approach in some configurable and flexible set of 'policies'. Azure, for example, [offers a number of types of policy configuration](https://docs.microsoft.com/en-us/azure/api-management/api-management-sample-flexible-throttling), where a config file is used to specify if rate limiting is per IP, per user, per client etc., what total quotas should be over longer periods, and so on. If a server wants to specify that certain groups of clients should be burst-limited to N requests per second on average but with total M megabytes bandwidth per day, that can't be achieved with the below approaches.  

2. *I propose concentrating on defining a commonly agreed-on policy configuration format that is general enough to encompass burst-control rate-limits (token buckets), periodic quotas (requests or bandwidth per day for example), eviction rules, response times, and client categories (free, premium, etc)*

3. A common general format allows for flexibility in implementation, and allows consensus to be arrived at more easily between Geth, Parity and other client implementers, while also being potentially useful to other protocols, such as Swarm.

4. The throttling/eviction/etc policy (which could include per message costs for example) _could_ be provided by the server as a hint to the client. I think this could be an optional request/reply call to the server and agreeing the message format across the implementers would be trivial as it would mirror the config file. It _need_ not be part of handshakes.

5. Unlike the proposals in the documents below, I do not think there should be any obligation on clients to try and maintain a mirror of the state of each server's token bucket or other limiting algorithm to work out how to throttle calls to that server. It complicates client development. A far simpler approach is to have the server issue a warning that some eviction rule is about to be violated. The server can then make a dynamic assesment of how to handle that. The client could also receive messages that the server is overloaded, which is unrelated to the throttling policy. The main body of the work would be getting agreement on the elements to include in a policy configuration structure and their meanings (rate limit vs quota vs response time etc), and specifying a couple of control messages or response codes (server overloaded, etc) and a request/reply message exchange to obtain the policy from the server if desired.

6. I think we need an agreed set of higher level design goals that declare something like "implementing light clients should be really easy because we want the Ethereum ecosystem to expand" and that "server operators should be able to choose their own throttling approaches and not be limited to client implementation mandates."

## Flow Control Review

### Document Summary ([Flow Control](https://github.com/zsfelfoldi/go-ethereum/wiki/Client-Side-Flow-Control-model-for-the-LES-protocol))

The document suggests that the design goals include the following:

1. Servers should be able to limit the 'amount of work' done for a light client.

2. Some sort of feedback should be given to the client about server load, to help them decide where to send requests when connected to multiple servers.

3. Clients should have some incentive to get their requests properly served.

With those design goals, the document proposes a model that can be summarised as:

1. Have servers assign different request types a 'cost'

2. Have the server implement a [leaky-bucket rate limiter](https://en.wikipedia.org/wiki/Token_bucket#Algorithm) per-client

3. Incentivise the client by dropping the client connection (and forcing the client to reconnect) whenever the token-bucket is depleted. Incidentally, this forces the client to implement the token-bucket in a way that mirrors the server in order to avoid being evicted. Hints are provided as an initial request cost table message in the handshake, along with per-call updates in the reply about the rate-limiter status on the server.

### Opinions (Flow Control)

1. One of the design goals should be to make it simple for light client implementers to join the network. Adoption of Ethereum will be enhanced when it is simple to discover a LES server and begin interacting.

2. Forcing light clients to mirror token-buckets is additional complexity. The client needs to mirror each connected server's token-bucket rules and parameters, depending on the connected server's implementation nuances and configuration. The model seems to make it hard to guess how to manage concurrent requests, especially when these are driven by UI events in a light client app.

3. Light clients already have sufficient incentive to find responsive servers. Disconnecting a client because they depleted the token-bucket is too draconian.

4. This additional complexity is not justified as a means of incentivising clients to get reliable responses.

5. The terms 'cost' (of a request) and 'the amount of work' (done by a server) attempt to express the same concept or metric. In reality each request will incur differing costs on each server or type of server depending on the relative importance and price of compute/memory/diskIO/networkIO and how each request type incurs those.

6. Given 5., it _is_ potentially useful for clients to understand the relative cost of each request type and the status of the server rate-limiter. This extra information however certainly doesn't feel essential, more of a nice to have for client apps wishing to manage user interaction in a graceful way by spreading calls out across servers dynamically. I would prefer to see a response message along the lines of http 503 (temporarily unavailable) or 429 (too many requests) on the first call that is throttled. This brings client development more in line with usual API consumption.

7. Another minus to consider, though probably unimportant, is that expressing the cost table could identify the nature of the server, as some information about the relative balance of IO/compute/etc can be revealed.

8. Disconnecting a client can incite the client to attempt a reconnect. The net effect on the server might be counterproductive.

9. The handshake establishes the per-request type cost table, but real server cost can change dynamically.

## Server Capacity Management Review

### Document Summary ([Server Capacity Management](./server_capacity_management.md)  )

The document is quite hard to read if you are not already in context, so the following summary is just my understanding of it.

1. It proposes a model for regulating light client 'capacity' assigned as a proportion of overall server 'capacity' (note that 'capacity' is not defined) as part of a server-scoped throttling control.

2. It proposes that the server should be 'self aware' of both its actual maximum capacity and its average historical capacity usage by some kind of unspecified self-monitoring method.

3. When total server capacity drops enough that it exceeds the total minimum required capacity of light clients currently connected, it suggests that some of those clients should be evicted.

4. When the server capacity is underused most of the time it proposes that 'overbooking' of the capacity can be permitted to allow more clients to connect than normal.

5. It introduces a distinction between free and priority clients, and some rules about how to assign capacity and evict free clients.

6. It introduces a notion of 'cost of service,' being composed of the cost of reservation of capacity for the connection and the actual cost to the server of each request. It's not clear to me what this notion is then used for.

### Opinions (Server Capacity Management)

1. I am not sure who the document is aimed at. While perhaps a nice guideline for a version of a specific implementation (eg: geth), I don't see why or how all implementers should feel compelled to implement their server capacity management in this way.

2. The real cost and real capacity of the server depends on how each type of request affects the different performance characteristics of the server. How does the server know that memory reduction is going to affect total capacity for example, and how does it calculate the costs?

3. Forced evictions made according to fluctuating server capacity or the joining of new free/priority light peers just makes light client development hard and usage unreliable. I think it is preferable if all stale connections get dropped after some period of inactivity, or whenever a client explicitly disconnects. If the server is unable to serve some of the connected light clients because of a transient fault, what rationale is there for converting that transient fault into a set of disconnections and terminating their service?

4. Clients could just be notified that the server is overloaded. It would be up to them to find new servers. Persistent server overload or denial (lack of payment for example) would eventually cause the client to look elsewhere. The client would abandon their connection, which would eventually be closed.

5. If the document implies that it is paving the way for micropayments, again I think we should look for inspiration from the cloud providers like Amazon and Azure. Clients could pay for _burst_ capacity reservation (as suggested in the document) and/or per-request. This could be established in the handshake as a payment channel.

6. In general I feel again this is a detailed specification that prescribes a narrow policy. I would suggest focussing on a server-scoped rate-limiter/quota policy that follows the same kind of format as the per-client policy.

7. Administrators would just be able to specify types of client (eg: priority, free, etc) and their associated throttling policy. A global throttling policy would 'feed' the per-client policies.