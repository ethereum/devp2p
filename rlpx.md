# The RLPx Transport Protocol

This specification defines the RLPx transport protocol, a TCP-based transport protocol
used for communication among Ethereum nodes. The protocol carries encrypted messages
belonging to one or more 'capabilities' which are negotiated during connection
establishment. RLPx is named after the [RLP] serialization format. The name is not an
acronym and has no particular meaning.

The current protocol version is **5**. You can find a list of changes in past versions at
the end of this document.

## Notation

`X || Y`\
    denotes concatenation of X and Y.\
`X ^ Y`\
    is byte-wise XOR of X and Y.\
`X[:N]`\
    denotes an N-byte prefix of X.\
`[X, Y, Z, ...]`\
    denotes recursive encoding as an RLP list.\
`keccak256(MESSAGE)`\
    is the Keccak256 hash function as used by Ethereum.\
`ecies.encrypt(PUBKEY, MESSAGE, AUTHDATA)`\
    is the asymmetric authenticated encryption function as used by RLPx.\
    AUTHDATA is authenticated data which is not part of the resulting ciphertext,\
    but written to HMAC-256 before generating the message tag.\
`ecdh.agree(PRIVKEY, PUBKEY)`\
    is elliptic curve Diffie-Hellman key agreement between PRIVKEY and PUBKEY.

## ECIES Encryption

ECIES (Elliptic Curve Integrated Encryption Scheme) is an asymmetric encryption method
used in the RLPx handshake. The cryptosystem used by RLPx is

- The elliptic curve secp256k1 with generator `G`.
- `KDF(k, len)`: the NIST SP 800-56 Concatenation Key Derivation Function
- `MAC(k, m)`: HMAC using the SHA-256 hash function.
- `AES(k, iv, m)`: the AES-128 encryption function in CTR mode.

Alice wants to send an encrypted message that can be decrypted by Bobs static private key
<code>k<sub>B</sub></code>. Alice knows about Bobs static public key
<code>K<sub>B</sub></code>.

To encrypt the message `m`, Alice generates a random number `r` and corresponding elliptic
curve public key `R = r * G` and computes the shared secret <code>S = P<sub>x</sub></code>
where <code>(P<sub>x</sub>, P<sub>y</sub>) = r * K<sub>B</sub></code>. She derives key
material for encryption and authentication as
<code>k<sub>E</sub> || k<sub>M</sub> = KDF(S, 32)</code> as well as a random
initialization vector `iv`. Alice sends the encrypted message `R || iv || c || d` where
<code>c = AES(k<sub>E</sub>, iv , m)</code> and
<code>d = MAC(sha256(k<sub>M</sub>), iv || c)</code> to Bob.

For Bob to decrypt the message `R || iv || c || d`, he derives the shared secret
<code>S = P<sub>x</sub></code> where
<code>(P<sub>x</sub>, P<sub>y</sub>) = k<sub>B</sub> * R</code> as well as the encryption and
authentication keys <code>k<sub>E</sub> || k<sub>M</sub> = KDF(S, 32)</code>. Bob verifies
the authenticity of the message by checking whether
<code>d == MAC(sha256(k<sub>M</sub>), iv || c)</code> then obtains the plaintext as
<code>m = AES(k<sub>E</sub>, iv || c)</code>.

## Node Identity

All cryptographic operations are based on the secp256k1 elliptic curve. Each node is
expected to maintain a static secp256k1 private key which is saved and restored between
sessions. It is recommended that the private key can only be reset manually, for example,
by deleting a file or database entry.

## Initial Handshake

An RLPx connection is established by creating a TCP connection and agreeing on ephemeral
key material for further encrypted and authenticated communication. The process of
creating those session keys is the 'handshake' and is carried out between the 'initiator'
(the node which opened the TCP connection) and the 'recipient' (the node which accepted it).

1. initiator connects to recipient and sends its `auth` message
2. recipient accepts, decrypts and verifies `auth` (checks that recovery of signature ==
   `keccak256(ephemeral-pubk)`)
3. recipient generates `auth-ack` message from `remote-ephemeral-pubk` and `nonce`
4. recipient derives secrets and sends the first encrypted frame containing the [Hello] message
5. initiator receives `auth-ack` and derives secrets
6. initiator sends its first encrypted frame containing initiator [Hello] message
7. recipient receives and authenticates first encrypted frame
8. initiator receives and authenticates first encrypted frame
9. cryptographic handshake is complete if MAC of first encrypted frame is valid on both sides

Either side may disconnect if authentication of the first framed packet fails.

Handshake messages:

    auth = auth-size || enc-auth-body
    auth-size = size of enc-auth-body, encoded as a big-endian 16-bit integer
    auth-vsn = 4
    auth-body = [sig, initiator-pubk, initiator-nonce, auth-vsn, ...]
    enc-auth-body = ecies.encrypt(recipient-pubk, auth-body || auth-padding, auth-size)
    auth-padding = arbitrary data

    ack = ack-size || enc-ack-body
    ack-size = size of enc-ack-body, encoded as a big-endian 16-bit integer
    ack-vsn = 4
    ack-body = [recipient-ephemeral-pubk, recipient-nonce, ack-vsn, ...]
    enc-ack-body = ecies.encrypt(initiator-pubk, ack-body || ack-padding, ack-size)
    ack-padding = arbitrary data

Implementations must ignore any mismatches in `auth-vsn` and `ack-vsn`. Implementations
must also ignore any additional list elements in `auth-body` and `ack-body`.

Secrets generated following the exchange of handshake messages:

    static-shared-secret = ecdh.agree(privkey, remote-pubk)
    ephemeral-key = ecdh.agree(ephemeral-privkey, remote-ephemeral-pubk)
    shared-secret = keccak256(ephemeral-key || keccak256(nonce || initiator-nonce))
    aes-secret = keccak256(ephemeral-key || shared-secret)
    mac-secret = keccak256(ephemeral-key || aes-secret)

## Framing

All messages following the initial handshake are framed. A frame carries a single
encrypted message belonging to a capability.

The purpose of framing is multiplexing multiple capabilites over a single connection.
Secondarily, as framed messages yield reasonable demarcation points for message
authentication codes, supporting an encrypted and authenticated stream becomes
straight-forward. Frames are encrypted and authenticated via key material generated during
the handshake.

The frame header provides information about the size of the message and the message's
source capability. Padding is used to prevent buffer starvation, such that frame
components are byte-aligned to block size of cipher.

    frame = header-ciphertext || header-mac || frame-ciphertext || frame-mac
    header-ciphertext = aes(aes-secret, header)
    header = frame-size || header-data || header-padding
    header-data = [capability-id, context-id]
    capability-id = integer, always zero
    context-id = integer, always zero
    header-padding = zero-fill header to 16-byte boundary
    frame-ciphertext = aes(aes-secret, frame-data || frame-padding)
    frame-padding = zero-fill frame-data to 16-byte boundary

See the [Capability Messaging] section for definitions of `frame-data` and `frame-size.`

### MAC

Message authentication in RLPx uses two keccak256 states, one for each direction of
communication. The `egress-mac` and `ingress-mac` keccak states are continuously updated
with the ciphertext of bytes sent (egress) or received (ingress). Following the initial
handshake, the MAC states are initialized as follows:

Initiator:

    egress-mac = keccak256.init((mac-secret ^ recipient-nonce) || auth)
    ingress-mac = keccak256.init((mac-secret ^ initiator-nonce) || ack)

Recipient:

    egress-mac = keccak256.init((mac-secret ^ initiator-nonce) || ack)
    ingress-mac = keccak256.init((mac-secret ^ recipient-nonce) || auth)

When a frame is sent, the corresponding MAC values are computed by updating the
`egress-mac` state with the data to be sent. The update is performed by XORing the header
with the encrypted output of its corresponding MAC. This is done to ensure uniform
operations are performed for both plaintext MAC and ciphertext. All MACs are sent
cleartext.

    header-mac-seed = aes(mac-secret, keccak256.digest(egress-mac)[:16]) ^ header-ciphertext
    egress-mac = keccak256.update(egress-mac, header-mac-seed)
    header-mac = keccak256.digest(egress-mac)[:16]

Computing `frame-mac`:

    egress-mac = keccak256.update(egress-mac, frame-ciphertext)
    frame-mac-seed = aes(mac-secret, keccak256.digest(egress-mac)[:16]) ^ keccak256.digest(egress-mac)[:16]
    egress-mac = keccak256.update(egress-mac, frame-mac-seed)
    frame-mac = keccak256.digest(egress-mac)[:16]

Verifying the MAC on ingress frames is done by updating the `ingress-mac` state in the
same way as `egress-mac` and comparing to the values of `header-mac` and `frame-mac` in
the ingress frame. This should be done before decrypting `header-ciphertext` and
`frame-ciphertext`.

# Capability Messaging

All messages following the initial handshake are associated with a 'capability'. Any
number of capabilities can be used concurrently on a single RLPx connection.

A capability is identified by a short ASCII name (max eight characters) and version number. The capabilities
supported on either side of the connection are exchanged in the [Hello] message belonging
to the 'p2p' capability which is required to be available on all connections.

## Message Encoding

The initial [Hello] message is encoded as follows:

    frame-data = msg-id || msg-data
    frame-size = length of frame-data, encoded as a 24bit big-endian integer

where `msg-id` is an RLP-encoded integer identifying the message and `msg-data` is an RLP
list containing the message data.

All messages following Hello are compressed using the Snappy algorithm.

    frame-data = msg-id || snappyCompress(msg-data)
    frame-size = length of frame-data encoded as a 24bit big-endian integer

Note that the `frame-size` of compressed messages refers to the compressed size of
`msg-data`. Since compressed messages may inflate to a very large size after
decompression, implementations should check for the uncompressed size of the data before
decoding the message. This is possible because the [snappy format] contains a length
header. Messages carrying uncompressed data larger than 16 MiB should be rejected by
closing the connection.

## Message ID-based Multiplexing

While the framing layer supports a `capability-id`, the current version of RLPx doesn't
use that field for multiplexing between different capabilities. Instead, multiplexing
relies purely on the message ID.

Each capability is given as much of the message-ID space as it needs. All such
capabilities must statically specify how many message IDs they require. On connection and
reception of the [Hello] message, both peers have equivalent information about what
capabilities they share (including versions) and are able to form consensus over the
composition of message ID space.

Message IDs are assumed to be compact from ID 0x10 onwards (0x00-0x0f is reserved for the
"p2p" capability) and given to each shared (equal-version, equal-name) capability in
alphabetic order. Capability names are case-sensitive. Capabilities which are not shared
are ignored. If multiple versions are shared of the same (equal name) capability, the
numerically highest wins, others are ignored.

## "p2p" Capability

The "p2p" capability is present on all connections. After the initial handshake, both
sides of the connection must send either [Hello] or a [Disconnect] message. Upon receiving
the [Hello] message a session is active and any other message may be sent. Implementations
must ignore any difference in protocol version for forward-compatibility reasons. When
communicating with a peer of lower version, implementations should try to mimic that
version.

At any time after protocol negotiation, a [Disconnect] message may be sent.

### Hello (0x00)

`[protocolVersion: P, clientId: B, capabilities, listenPort: P, nodeKey: B_64, ...]`

First packet sent over the connection, and sent once by both sides. No other messages may
be sent until a Hello is received. Implementations must ignore any additional list elements
in Hello because they may be used by a future version.

- `protocolVersion` the version of the "p2p" capability, **5**.
- `clientId` Specifies the client software identity, as a human-readable string (e.g.
  "Ethereum(++)/1.0.0").
- `capabilities` is the list of supported capabilities and their versions:
  `[[cap1, capVersion1], [cap2, capVersion2], ...]`.
- `listenPort` specifies the port that the client is listening on (on the interface that
  the present connection traverses). If 0 it indicates the client is not listening.
- `nodeId` is the secp256k1 public key corresponding to the node's private key.

### Disconnect (0x01)

`[reason: P]`

Inform the peer that a disconnection is imminent; if received, a peer should disconnect
immediately. When sending, well-behaved hosts give their peers a fighting chance (read:
wait 2 seconds) to disconnect to before disconnecting themselves.

`reason` is an optional integer specifying one of a number of reasons for disconnect:

| Reason | Meaning                                                      |
|--------|:-------------------------------------------------------------|
| `0x00` | Disconnect requested                                         |
| `0x01` | TCP sub-system error                                         |
| `0x02` | Breach of protocol, e.g. a malformed message, bad RLP, ...   |
| `0x03` | Useless peer                                                 |
| `0x04` | Too many peers                                               |
| `0x05` | Already connected                                            |
| `0x06` | Incompatible P2P protocol version                            |
| `0x07` | Null node identity received - this is automatically invalid  |
| `0x08` | Client quitting                                              |
| `0x09` | Unexpected identity in handshake                             |
| `0x0a` | Identity is the same as this node (i.e. connected to itself) |
| `0x0b` | Ping timeout                                                 |
| `0x10` | Some other reason specific to a subprotocol                  |

### Ping (0x02)

`[]`

Requests an immediate reply of [Pong] from the peer.

### Pong (0x03)

`[]`

Reply to the peer's [Ping] packet.

# Change Log

### Known Issues in the current version

- The frame encryption/MAC scheme is considered 'broken' because `aes-secret` and
  `mac-secret` are reused for both reading and writing. The two sides of a RLPx connection
  generate two CTR streams from the same key, nonce and IV. If an attacker knows one
  plaintext, they can decrypt unknown plaintexts of the reused keystream.
- General feedback from reviewers has been that the use of a keccak256 state as a MAC
  accumulator and the use of AES in the MAC algorithm is an uncommon and overly complex
  way to perform message authentication but can be considered safe.
- The frame encoding provides `capability-id` and `context-id` fields for multiplexing
  purposes, but these fields are unused.

### Version 5 (EIP-706, September 2017)

[EIP-706] added Snappy message compression.

### Version 4 (EIP-8, December 2015)

[EIP-8] changed the encoding of `auth-body` and `ack-body` in the initial handshake to
RLP, added a version number to the handshake and mandated that implementations should
ignore additional list elements in handshake messages and [Hello].

# References

- Elaine Barker, Don Johnson, and Miles Smid. NIST Special Publication 800-56A Section 5.8.1,
  Concatenation Key Derivation Function. 2017.\
  URL <https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-56ar.pdf>

- Victor Shoup. A proposal for an ISO standard for public key encryption, Version 2.1. 2001.\
  URL <http://www.shoup.net/papers/iso-2_1.pdf>

- Mike Belshe and Roberto Peon. SPDY Protocol - Draft 3. 2014.\
  URL <http://www.chromium.org/spdy/spdy-protocol/spdy-protocol-draft3>

- Snappy compressed format description. 2011.\
  URL <https://github.com/google/snappy/blob/master/format_description.txt>

Copyright &copy; 2014 Alex Leverington.
<a rel="license" href="http://creativecommons.org/licenses/by-nc-sa/4.0/">
This work is licensed under a
Creative Commons Attribution-NonCommercial-ShareAlike
4.0 International License</a>.

[Hello]: #hello-0x00
[Disconnect]: #disconnect-0x01
[Ping]: #ping-0x02
[Pong]: #pong-0x03
[Capability Messaging]: #capability-messaging
[EIP-8]: https://eips.ethereum.org/EIPS/eip-8
[EIP-706]: https://eips.ethereum.org/EIPS/eip-706
[RLP]: https://github.com/ethereum/wiki/wiki/RLP
[snappy format]: https://github.com/google/snappy/blob/master/format_description.txt
