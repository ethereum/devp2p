# Ethereum Node Records

This specification defines Ethereum Node Records (ENR), an open format for p2p
connectivity information. A node record usually contains the network endpoints of a node,
i.e. the node's IP addresses and ports. It also holds information about the node's purpose
on the network so others can decide whether to connect to the node.

Ethereum Node Records were originally proposed in [EIP-778].

## Record Structure

The components of a node record are:

- `signature`: cryptographic signature of record contents
- `seq`: The sequence number, a 64-bit unsigned integer. Nodes should increase the number
  whenever the record changes and republish the record.
- The remainder of the record consists of arbitrary key/value pairs

A record's signature is made and validated according to an *identity scheme*. The identity
scheme is also responsible for deriving a node's address in the DHT.

The key/value pairs must be sorted by key and must be unique, i.e. any key may be present
only once. The keys can technically be any byte sequence, but ASCII text is preferred. Key
names in the table below have pre-defined meaning.

| Key         | Value                                      |
|:------------|:-------------------------------------------|
| `id`        | name of identity scheme, e.g. "v4"         |
| `secp256k1` | compressed secp256k1 public key, 33 bytes  |
| `ip`        | IPv4 address, 4 bytes                      |
| `tcp`       | TCP port, big endian integer               |
| `udp`       | UDP port, big endian integer               |
| `ip6`       | IPv6 address, 16 bytes                     |
| `tcp6`      | IPv6-specific TCP port, big endian integer |
| `udp6`      | IPv6-specific UDP port, big endian integer |

All keys except `id` are optional, including IP addresses and ports. A record without
endpoint information is still valid as long as its signature is valid. If no `tcp6` /
`udp6` port is provided, the `tcp` / `udp` port applies to both IP addresses. Declaring
the same port number in both `tcp`, `tcp6` or `udp`, `udp6` should be avoided but doesn't
render the record invalid.

### RLP Encoding

The canonical encoding of a node record is an RLP list of `[signature, seq, k, v, ...]`.
The maximum encoded size of a node record is 300 bytes. Implementations should reject
records larger than this size.

Records are signed and encoded as follows:

    content   = [seq, k, v, ...]
    signature = sign(content)
    record    = [signature, seq, k, v, ...]

### Text Encoding

The textual form of a node record is the base64 encoding of its RLP representation,
prefixed by `enr:`. Implementations should use the [URL-safe base64 alphabet]
and omit padding characters.

### "v4" Identity Scheme

This specification defines a single identity scheme to be used as the default until other
schemes are defined by further EIPs. The "v4" scheme is backwards-compatible with the
cryptosystem used by Node Discovery v4.

- To sign record `content` with this scheme, apply the keccak256 hash function (as used by
  the EVM) to `content`, then create a signature of the hash. The resulting 64-byte
  signature is encoded as the concatenation of the `r` and `s` signature values (the
  recovery ID `v` is omitted).

- To verify a record, check that the signature was made by the public key in the
  "secp256k1" key/value pair of the record.

- To derive a node address, take the keccak256 hash of the uncompressed public key, i.e.
  `keccak256(x || y)`. Note that `x` and `y` must be zero-padded up to length 32.

## Rationale

The format is meant to suit future needs in two ways:

- Adding new key/value pairs: This is always possible and doesn't require implementation
  consensus. Existing clients will accept any key/value pairs regardless of whether they
  can interpret their content.
- Adding identity schemes: these need implementation consensus because the network won't
  accept the signature otherwise. To introduce a new identity scheme, propose an EIP and
  get it implemented. The scheme can be used as soon as most clients accept it.

The size of a record is limited because records are relayed frequently and may be included
in size-constrained protocols such as DNS. A record containing a IPv4 address, when signed
using the "v4" scheme occupies roughly 120 bytes, leaving plenty of room for additional
metadata.

You might wonder about the need for so many pre-defined keys related to IP addresses and
ports. This need arises because residential and mobile network setups often put IPv4
behind NAT while IPv6 traffic—if supported—is directly routed to the same host. Declaring
both address types ensures a node is reachable from IPv4-only locations and those
supporting both protocols.

## Test Vectors

This is an example record containing the IPv4 address `127.0.0.1` and UDP port `30303`.
The node ID is `a448f24c6d18e575453db13171562b71999873db5b286df957af199ec94617f7`.

    enr:-IS4QHCYrYZbAKWCBRlAy5zzaDZXJBGkcnh4MHcBFZntXNFrdvJjX04jRzjzCBOonrkTfj499SZuOh8R33Ls8RRcy5wBgmlkgnY0gmlwhH8AAAGJc2VjcDI1NmsxoQPKY0yuDUmstAHYpMa2_oxVtw0RW_QAdpzBQA8yWM0xOIN1ZHCCdl8

The record is signed using the "v4" identity scheme using sequence number `1` and this
private key:

    b71c71a67e1177ad4e901695e1b4b9ee17ae16c6668d313eac2f96dbcda3f291

The RLP structure of the record is:

    [
      7098ad865b00a582051940cb9cf36836572411a47278783077011599ed5cd16b76f2635f4e234738f30813a89eb9137e3e3df5266e3a1f11df72ecf1145ccb9c,
      01,
      "id",
      "v4",
      "ip",
      7f000001,
      "secp256k1",
      03ca634cae0d49acb401d8a4c6b6fe8c55b70d115bf400769cc1400f3258cd3138,
      "udp",
      765f,
    ]

[EIP-778]: https://eips.ethereum.org/EIPS/eip-778
[URL-safe base64 alphabet]: https://tools.ietf.org/html/rfc4648#section-5
