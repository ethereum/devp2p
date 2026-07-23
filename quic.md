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

### Node ID Binding

Since the public key used by TLS does not match the key used for signing the ENR, fresh
connections must prove ownership of the node key that signed the ENR. To do this, the both
sides must create a binding signature over the negotiated key material of the QUIC
connection.

To get the key material, use a 'key exporter' with the `ENR key binding v1` label and a
length of `32`.

The first message on stream zero sent by the server is the `id-proof`.

    id-proof = "ENR-key-proof-v1" || id-signature
    id-signature = sign(nodekey, tls-exported-key)
