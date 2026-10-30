# ethp2p QUIC transport

This document specifies a QUIC-based protocol that nodes on the execution layer
implement to enable connectivity from browsers, and between each other.

## Connection Setup

### TLS Certificate

Implementations must generate a new, self-signed TLS certificate with a lifetime of two
weeks. If the node is to run for longer than two weeks, a new certificate must be created
and announced (see below) ahead of time.

Certificates should support key material for a P256-curve based key exchange. The TLS
configuration must include support for the `TLS_AES_128_GCM_SHA256` cipher suite, and may
include support for more cipher suites.

### Certificate Hashes in Discovery

For node implementations that support QUIC, the ENR must include the SHA256 hashes of the
current certificate (and next certificate). This is to be stored in the `qh` ENR key,
which should have a size of either 32 bytes (for one certificate) or 64 bytes (for two
certificates).

The certificate hashes are computed as the SHA256 hash of the DER encoding of the
certificate. This feature exists primarily for compatibility with WebTransport, but
non-browser implementations should also verify the presented certificate upon connection
to an ENR.

### Capability Exchange

As part of the connection setup, capabilities are exchanged between the two peers.
Capabilities are strings containing a protocol name and version, e.g. `eth/72`. The
exchange proceeds as follows:

First, the client announces their available capabilities using the `WT-Available-Protocols`
header.

Second, the server processes the incoming capability list and matches it against its
available capabilities. However, it does not set the `WT-Protocol` header in the response,
since that can only carry a single protocol. Instead, it will deliver the list of chosen
capabilities within the first RLP message on the first bidirectional stream, together with
the `id-proof` (see section below).

Thus, the first `handshake` message sent by the server on the first stream is

    handshake = [id-proof, capabilities]
    capabilities = [cap₁, cap₂, ..., capₙ]

### Node ID Binding

Since the public key used by TLS does not match the key used for signing the ENR, fresh
connections must prove ownership of the node key that signed the ENR. The proof is a
signature over a challenge string.

    id-proof = sign(nodekey, challenge)

How the challenge is created depends on the peer type. There are browser connections and
node-to-node connections. The server can distinguish the two peer types by inspecting the
`WT-Available-Protocols` header. If it contains a challenge, it is assumed to be a browser
connection.

Upon receiving `handshake` from the server, the client verifies the `id-proof` signature
against the node key in the ENR which it dialed.

#### Browser Connections

For connections using WebTransport, the dialer generates a random 32 byte nonce and sends
the challenge as a member of the `WT-Available-Protocols` header in the CONNECT request.

    challenge = "ENR-key-proof-v1=" || hex(nonce)

The server opens the first bidirectional stream and immediately sends its `handshake`
message.

#### Node-to-Node Connections

For node to node connections, the challenge is derived from the negotiated key material
of the QUIC connection. To get the key material, use a 'key exporter' with the `ENR key
binding v1` label and a length of `32`.

    challenge = "ENR-key-proof-v1=" || hex(tls-exported-key)
    
The server opens the first bidirectional stream and sends its `handshake`. dialer replies
with its own id proof on the same stream. The server uses the recovered public key as 
the node ID of the peer.

## Sub-Protocol Messaging

After the initial establishment of sub-protocol streams, the selected protocols can
communicate over the streams freely. The encoding of sub-protocol messages is generally
left unspecified, but see below for the encoding used by legacy devp2p protocols.

### Devp2p Protocol Messaging

For devp2p protocols such as `eth`, `snap`, all messages use a framed encoding.

    frame = msg-id || frame-size || snappyCompress(msg-data)

The frame is prefixed by a one-byte `msg-id`, followed by a 24-bit `frame-size` and
compressed `msg-data`.

Note that the `frame-size` refers to the compressed size of `msg-data`. Since compressed
messages may inflate to a very large size after decompression, implementations should
check for the uncompressed size of the data before decoding the message. This is possible
because the [snappy format] contains a length header. Messages carrying uncompressed data
larger than 16 MiB should be rejected by closing the connection.

[snappy format]: https://github.com/google/snappy/blob/master/format_description.txt
