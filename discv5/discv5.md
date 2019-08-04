# Node Discovery Protocol v5

**Draft of April 2019.**

Welcome to the Node Discovery Protocol v5 specification!

Note that this specification is a work in progress and may change incompatibly without
prior notice.

Node Discovery is a system for finding other participants in a peer-to-peer network. The
system can be used by any node, for any purpose, at no cost other than running the network
protocol and storing a limited number of other nodes' records. Any node can be used as the
an entry point into the network.

The system's design is loosely inspired by the Kademlia DHT, but unlike most DHTs no
arbitrary keys and values are stored. Instead, the DHT stores and relays 'node records',
which are signed documents providing information about nodes in the network. Node
Discovery acts as a database of all live nodes in the network and performs three basic
functions:

- Sampling the set of all live participants: by walking the DHT, the network can be
  enumerated.
- Searching for participants providing a certain service: Node Discovery v5 includes a
  scalable facility for registering 'topic advertisements'. These advertisements can be
  queried and nodes advertising a topic found.
- Authoritative resolution of node records: if a node's ID is known, the most recent
  version of its record can be retrieved.

## Specification Overview

The specification has three parts:

- [discv5-wire.md] defines the wire protocol.
- [discv5-theory.md] describes the algorithms and data structures.
- [discv5-rationale.md] contains the design rationale.

## Comparison With Other Discovery Mechanisms

Systems such as MDNS/Bonjour allow finding hosts in a local-area network. The Node
Discovery Protocol is designed to work on the Internet and is most useful for applications
with a large number of participants spread across the Internet.

Systems using a rendezvous server: these systems are commonly used by desktop applications
or cloud services to connect participants to each other. While undoubtedly efficient, this
requires trust in the operator of the rendezvous server and these systems are prone to
censorship. Compared to a rendezvous server, The Node Discovery Protocol doesn't rely on a
single operator and places a small amount of trust in every participant. It becomes more
resistant to censorship as the size of the network increases and participants of multiple
distinct peer-to-peer networks can share the discovery network to further increase its
resilience.

The Achilles heel of the Node Discovery Protocol is the process of joining the network:
while any other node may be used as an entry point, such a node must first be located
through some other mechanism. Several approaches including scalable listing of initial
entry points in DNS or discovery of participants in the local network can be used for
reasonable secure entry into the network.

## Comparison With Node Discovery v4

- Topic advertisement was added.
- Arbitrary node metadata can be stored/relayed.
- Node identity crypto is extensible, use of secp256k1 keys isn't strictly required.
- The protocol no longer relies on the system clock.
- Communication is encrypted, protecting topic searches and record lookups against passive
  observers.

[discv5-wire.md]: ./discv5-wire.md
[discv5-theory.md]: ./discv5-theory.md
[discv5-rationale.md]: ./discv5-rationale.md
