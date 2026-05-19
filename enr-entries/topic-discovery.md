# The "topic-discovery" ENR entry

This specification defines the "topic-discovery" ENR entry, which signals that a node
implements the [TopDisc][topdisc] topic discovery capability for [Node Discovery v5][discv5]
and is willing to participate in topic service tables, registrations, and lookups.

## Entry Format

    entry-key   = "topic-discovery"
    entry-value = version

Where `version` is an unsigned integer identifying the supported TopDisc protocol version.
A node implementing the version described in the [TopDisc theory][topdisc] document sets:

    topic-discovery = 1

## Semantics

A node MUST publish the `topic-discovery` entry in its ENR before it can be selected as a
registrar or as a target of topic-discovery queries by other nodes. Nodes whose ENR does
not contain `topic-discovery`, or whose `topic-discovery` value is not understood by the
local implementation, MUST NOT be inserted into local TopDisc service tables and MUST NOT
be selected for topic registration or lookup requests.

The entry does not by itself indicate which services or topics a node advertises. Service
membership is established through TopDisc registrations and observed at runtime; the ENR
entry only signals capability and protocol version compatibility.

Future, non-backwards-compatible revisions of the topic discovery capability MUST bump the
`version` value. Implementations that encounter an unknown version SHOULD treat the node
as if it did not publish the entry at all. Implementations MAY support multiple versions
simultaneously; the matching rule between local and remote versions is defined by local
policy.

## Change Log

### Initial version (2026)

The initial version of the "topic-discovery" entry is proposed in this document, alongside
the [Discv5 wire][discv5-wire] and [TopDisc theory][topdisc] specifications.

[discv5]: ../discv5/discv5.md
[topdisc]: ../discv5/discv5-theory.md
[discv5-wire]: ../discv5/discv5-wire.md
