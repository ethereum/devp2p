# The "snap" ENR entry

This specification defines the "snap" ENR entry, which provides information about the
[snap capability] provided by a node. The presence of this entry in a node's ENR indicates
that the node serves the snap protocol. ENRs containing the "snap" entry must also contain
an [eth entry], which provides information about the specific Ethereum blockchain served
by the node.

## Entry Format

    entry-key   = "snap"
    entry-value = [ version, ... ]

The "snap" entry is a list of the snap protocol versions that the node serves, as unsigned
integers in ascending order. An empty list means that the node serves snap/1 only.

Examples:

- `[]`: the node serves snap/1.
- `[1, 2]`: the node serves snap/1 and snap/2.
- `[2]`: the node serves snap/2 only.

A node should add the entry only when it serves snap requests, and not while it only uses
the protocol to synchronize.

Implementations must ignore list elements that they do not understand. A node that looks
for peers of a specific snap version should select on the versions in the list, not on
the presence of the entry.

## Change Log

### Version list ([EIP-8189], 2026)

The entry value lists the served snap versions, so that nodes can find snap/2 servers.
The empty list keeps its earlier meaning.

### Initial Version (November 2020)

The initial version of the snap entry was an empty list with the sole purpose of
signaling snap server support.

[snap capability]: ../caps/snap.md
[eth entry]: ./eth.md
[EIP-8189]: https://eips.ethereum.org/EIPS/eip-8189
