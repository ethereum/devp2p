# The RLPx Transport Protocol

This specification defines the RLPx transport protocol, a TCP-based transport protocol
used for communication among Ethereum nodes. The protocol works with encrypted frames of
arbitrary content, though it is typically used to carry the devp2p application protocol.

## Node Identity

All cryptographic operations are based on the secp256k1 elliptic curve. Each node is
expected to maintain a static private key which is saved and restored between sessions. It
is recommended that the private key can only be reset manually, for example, by deleting a
file or database entry.

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
<code>d = MAC(k<sub>M</sub>, iv || c)</code> to Bob.

For Bob to decrypt the message `R || iv || c || d`, he derives the shared secret
<code>S = P<sub>x</sub></code> where
<code>(P<sub>x</sub>, P<sub>y</sub>) = k<sub>B</sub> * R</code> as well as the encryption and
authentication keys <code>k<sub>E</sub> || k<sub>M</sub> = KDF(S, 32)</code>. Bob verifies
the authenticity of the message by checking whether
<code>d == MAC(k<sub>M</sub>, iv || c)</code> then obtains the plaintext as
<code>m = AES(k<sub>E</sub>, iv || c)</code>.

## Handshake

The 'handshake' establishes key material to be used for the duration of the session. It is
carried out between the initiator (the node which opened the TCP connection) recipient
(the node which accepted it).

Handshake protocol:

`E` is the ECIES asymmetric encryption function defined above.

```text

auth -> E(remote-pubk, S(ephemeral-privk, static-shared-secret ^ nonce) || H(ephemeral-pubk) || pubk || nonce || 0x0)
auth-ack -> E(remote-pubk, remote-ephemeral-pubk || nonce || 0x0)

static-shared-secret = ecdh.agree(privkey, remote-pubk)
```

Values generated following the handshake (see below for steps):

```text
ephemeral-shared-secret = ecdh.agree(ephemeral-privkey, remote-ephemeral-pubk)
shared-secret = keccak256(ephemeral-shared-secret || keccak256(nonce || initiator-nonce))
aes-secret = keccak256(ephemeral-shared-secret || shared-secret)
# destroy shared-secret
mac-secret = keccak256(ephemeral-shared-secret || aes-secret)
# destroy ephemeral-shared-secret

Initiator:
egress-mac = keccak256.update(mac-secret ^ recipient-nonce || auth-sent-init)
# destroy nonce
ingress-mac = keccak256.update(mac-secret ^ initiator-nonce || auth-recvd-ack)
# destroy remote-nonce

Recipient:
egress-mac = keccak256.update(mac-secret ^ initiator-nonce || auth-sent-ack)
# destroy nonce
ingress-mac = keccak256.update(mac-secret ^ recipient-nonce || auth-recvd-init)
# destroy remote-nonce
```

Creating authenticated connection:

1. initiator connects to recipient and sends `auth` message
2. recipient accepts, decrypts and verifies `auth` (checks that recovery of signature ==
   `keccak256(ephemeral-pubk)`)
3.  recipient generates `auth-ack` message from `remote-ephemeral-pubk` and `nonce`
4.  recipient derives secrets and sends the first payload frame
5.  initiator receives `auth-ack` and derives secrets
6.  initiator sends first payload frame
7.  recipient receives and authenticates first payload frame
8.  initiator receives and authenticates first payload frame
9.  cryptographic handshake is complete if MAC of first payload frame is valid on both sides

# Framing

All packets following `auth` are framed. Either side may disconnect if authentication of
the first framed packet fails.

The primary purpose behind framing packets is in order to robustly support multiplexing
multiple protocols over a single connection. Secondarily, as framed packets yield
reasonable demarcation points for message authentication codes, supporting an encrypted
stream becomes straight-forward. Frames are authenticated via key material which is
generated during the handshake.

The frame header provides information about the size of the packet and the packet's source
protocol.

```text
frame = header || header-mac || frame-data || frame-mac
header = frame-size || header-data || padding
frame-size = size of frame excluding padding, integer < 2**24, big endian
header-data = rlp.list(protocol-type[, context-id])
protocol-type = integer < 2**16, big endian
context-id = integer < 2**16, big endian
padding = zero-fill to 16-byte boundary
frame-content = any binary data

header-mac = left16(egress-mac.update(aes(mac-secret,egress-mac)) ^ header-ciphertext).digest
frame-mac = left16(egress-mac.update(aes(mac-secret,egress-mac)) ^ left16(egress-mac.update(frame-ciphertext).digest))
egress-mac = keccak256 state, continuously updated with egress bytes
ingress-mac = keccak256 state, continuously updated with ingress bytes

left16(x) is the first 16 bytes of x
|| is concatenate
^ is xor
```

Message authentication is achieved by continuously updating `egress-mac` or `ingress-mac`
with the ciphertext of bytes sent (egress) or received (ingress); for headers the update
is performed by xoring the header with the encrypted output of it's corresponding mac (see
header-mac above for example). This is done to ensure uniform operations are performed for
both plaintext mac and ciphertext. All macs are sent cleartext.

Padding is used to prevent buffer starvation, such that frame components are byte-aligned
to block size of cipher.

## Known Issues

- The RLPx handshake is considered 'broken crypto' because `aes-secret` and `mac-secret`
  are reused for both reading and writing. The two sides of a RLPx connection generate two
  CTR streams from the same key, nonce and IV. If an attacker knows one plaintext, they can
  decrypt unknown plaintexts of the reused keystream.
- The frame encoding provides a `protocol-type` field for multiplexing purposes, but this
  field is unused by devp2p.

## References
- Petar Maymounkov and David Mazieres. Kademlia: A Peer-to-peer Information System Based on the XOR Metric. 2002. URL { https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf }
- Victor Shoup. A proposal for an ISO standard for public key encryption, Version 2.1. 2001. URL { http://www.shoup.net/papers/iso-2_1.pdf }
- Mike Belshe and Roberto Peon. SPDY Protocol - Draft 3. 2014. URL { http://www.chromium.org/spdy/spdy-protocol/spdy-protocol-draft3 }

Copyright &copy; 2014 Alex Leverington.
<a rel="license" href="http://creativecommons.org/licenses/by-nc-sa/4.0/">This work is licensed under a
<a rel="license" href="http://creativecommons.org/licenses/by-nc-sa/4.0/">Creative Commons Attribution-NonCommercial-ShareAlike
4.0 International License</a>.
