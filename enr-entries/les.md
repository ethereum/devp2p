# The "les" ENR entry

This specification defines the "les" ENR entry, which provides information about the [les
capability] provided by a node. The presence of this entry in a node's ENR indicates that
the node is acting as a light client server. ENRs containing the "les" entry must also
contain an [eth entry], which provides information about the specific Ethereum blockchain
served by LES.

## Entry Format

    entry-key   = "les"
    entry-value = [ vflux-version ]

At this time, the "les" entry is a single element list containing the version number of
the 'vflux' payment protocol.

In order to be compatible with future versions of this specifications, implementations
should ignore any additional list elements in `entry-value`.

## Change Log

### vflux-version (March 2021)

In March 2021, the les entry was updated to include the vflux version number.

### Initial Version (October 2019)

The initial version of the les entry was an empty list with the sole purpose of
signaling LES server support.

[les capability]: ../caps/les.md
[eth entry]: ./eth.md
