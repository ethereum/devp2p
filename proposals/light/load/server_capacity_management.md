
### Proposal Summary

Note: this document by Zsolt Felfoldi was originally at https://gist.github.com/zsfelfoldi/8d1dfa05ce1e4b50ea5fe1573fb461d6

This proposal describes a server load management approach, where light clients may be categorised as free or premium and given percentages of a dynamically assessed server capacity.


### Server capacity

In the LES service model capacity is defined as a scalar value which is assigned to each client while the total capacity of simultaneously connected clients is limited (`totalConnCap` <= `totalCapacity`). The exact meaning of capacity values may depend on the server implementation and may change in subsequent versions. The behavior expected from the server is that in any situation the served amount of similar types of requests should be proportional to the capacity value. (Note: this behavior is also tested by https://github.com/ethereum/go-ethereum/blob/master/les/api_test.go). The server also specifies specifies a minimum useful value for client capacity `minCapacity` which in practice means a large enough flow control buffer that allows the client to send all types of requests.

The total capacity of the server can change dynamically for various reasons. The actual request serving capacity can change due to external circumstances and it can only be properly measured while actually serving a high amount of requests, therefore dynamic corrections are necessary during operation. Also if most of the server capacity remains unused most of the time then a certain amount of dynamic "overbooking" is acceptable (see below). For these reasons the total capacity may be changed at any time which also means sometimes some clients might need to be kicked out.

#### Overbooking server capacity

LES flow control tries to more or less guarantee the possibility for the clients to send a certain amount of requests at any time and get a quick response. Most of the clients want this guarantee but don't actually need to send requests most of the time. Our goal is to serve as many clients as possible while the actually used server capacity does not exceed the limits. More exactly, the sum of assigned capacities of those clients nodes whose flow control buffer is currently being recharged (`sumRecharge`) should not exceed the actual request serving capacity which is controlled by limiting the total amount of flow control buffer recharge (`totalRecharge`). If `totalCapacity` == `totalRecharge` then there is no overbooking and `sumRecharge` can never exceed `totalRecharge`. If `totalCapacity` > `totalRecharge` then it is possible but the server may predict that this is unlikely to happen (especially if its client management/pricing strategy disincentivizes excessive request sending) and allow a somewhat higher amount of clients to connect. Should it happen anyway, the server can still disconnect the least important and/or most agressive clients and thereby instantly reduce `sumRecharge` under the desired limit.

Even though this is an undesirable event since it weakens the guarantee the server tries to provide, its average frequency of occurence can be limited to arbitrarily low levels if `totalCapacity` is also immediately reduced when clients are kicked out and it is only gradually increased at a limited rate when `totalConnCap` is close to `totalCapacity` and `sumRecharge` is still well below `totalRecharge`. `totalCapacity` should also be limited to `maxCapacity` in order to avoid mass disconnections after a low-usage period driving `totalCapacity` to extremely high levels.

#### Client management strategy

We identify two classes of clients: "free" and "priority" clients. Free clients are those who the server does not know anything about. Priority can be assigned to certain clients through the API (along with a capacity value). Priority clients can always connect as long as the total amount of connected priority client capacity (`totalPriConnCap`) does not exceed `totalCapacity`. They are only kicked out if `totalCapacity` is dynamically reduced under `totalPriConnCap`. In this case the API gives a short time window for the managing endpoint to reduce the assigned capacity of some priority clients (or at least decide which one to kick out) before the system disconnects one of them automatically.
Free clients get the minimum amount of capacity if there is enough free capacity for them or if there is another free client which can be kicked out. Although free clients don't pay for the service a virtual cost balance is kept for the recently seen ones which is used as a negative priority. Free clients from recently unseen IP addresses have a higher chance of connecting and they can even push out those which received service recently. Free clients with the highest negative priority are also kicked out first if a priority client wants to connect or if `totalCapacity` is dynamically reduced.

##### Time cost and request cost

Cost of service (either virtual or actual) consists of two components: the cost of having a live connection (proportional to connection time and capacity) and the cost of served requests (proportional to the sum of `realCost` of served requests). For actual micropayment incentivization different pricing strategies may be applied so the API provides information about both types of resource usage per client. A suggested strategy for choosing the relative weights of time and request costs:

- while `totalCapacity` is limited by disconnections and is therefore less than `maxCapacity`, request cost should dominate
- if `totalCapacity` == `maxCapacity` and `sumRecharge` is consistently well under `totalRecharge` then time cost should dominate

### The API

##### Global parameter queries

The system provides the following global capacity values which could all be made accessible through the API:

- `minCapacity`
- `freeCapacity` (capacity assigned to free clients, currently equals `minCapacity`, should we expose it separately?)
- `totalCapacity`
- `totalRecharge` (sounds a bit technical, should we name it something else, like `baseCapacity` ?)
- `maxCapacity`
- `totalConnCap`
- `totalPriConnCap`
- `totalPriCap` (all assigned priority capacities whether connected or not)

Questions:

- should the API focus on priority clients entirely and make the free client pool completely transparent? (in this case that would mean omitting `freeCapacity` and `totalConnCap`)
- should I add separate queries for these or make a single capacity query that returns all of these in a map?

##### Individual priority client capacity assignment

- `setClientCapacity(id, cap)`
- `getClientCapacity(id)`

(zero means no priority status)

##### Client list queries

- `listClients(filter)` (returns a list of (id, capacity) pairs)

Filter can be either of the following:

- all connected (may be omitted if we care about priority clients only)
- all priority assigned
- all priority connected

Question: should we provide separate query functions instead?

##### Event subscription

The following types of events might require a subscription:

- reduced `totalCapacity` may require action from the endpoint if it goes under `totalPriConnCap`
- client connecting/disconnecting (only for priority clients? or use optional filter?)
- regular updates about priority client resource usage (send an update after a certain amount of usage)
	- alternatively just use polling? maybe add this info to the priority client list query?
	- or provide an alarm function that the endpoint can set up so that it gets an event when the client's balance is expired?

I propose a single subscription with some filter options and a general event format:

- `totalCapacity`, `totalConnCap`, `totalPriConn`
- `client id` (if it is a client event)
	- `capacity`
	- `isPriority` (only if we allow filtering for non-priority clients too)
	- `event`
		- "connented", "disconnected", "update"
	- `timeCost`, `requestCost` (total since connection)

The event filter options depend on the answers to the questions above so I will try to finalize them after figuring out those.