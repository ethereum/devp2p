# Node Discovery Protocol v5 - Wire Protocol

**Draft of October 2019.**

This document specifies the wire protocol of Node Discovery v5. Note that this
specification is a work in progress and may change incompatibly without prior notice.

## Notation

Here we present the notation that is used throughout this document.

`[ .. , .. , .. ]`\
    is recursive encoding as an RLP list\
`rlp_bytes(x)`\
    is the RLP encoding of the byte array `x`\
`a || b`\
    means binary concatenation of `a` and `b`\
`xor(a, b)`\
    means binary XOR of `a` and `b`\
`sha256(x)`\
    is the SHA256 digest of `x`\
`aesgcm_encrypt(key, nonce, pt, ad)`\
    is AES-GCM encryption/authentication with the given `key`, `nonce` and additional\
    authenticated data `ad`. Size of `key` is 16 bytes (AES-128), size of `nonce` 12 bytes.

## UDP Communication

Node discovery messages are sent as UDP datagrams. Since UDP is a lossy transport, packets
may be received in any order or not at all. Implementations should not re-send packets if
the recipient doesn't respond, though there are exceptions to this general rule. If
multiple requests are pending while performing the handshake, the requests may be re-sent
with new keys (see [handshake section]). If a node's liveness has been verified many
times, implementations may consider occasional non-responsiveness permissible and assume
the node is live.

The maximum size of any packet is 1280 bytes. Implementations should not generate or
process packets larger than this size. Most messages are smaller than this limit by
definition, the exception being the NODES message. FINDNODE returns up to 16 records, plus
other data, and TOPICQUERY may also distribute a significantly long list of ENRs. As per
specification the maximum size of an ENR is 300 bytes. A NODES message containing all
FINDNODE response records would be at least 4800 bytes, not including additional data such
as the header. To stay below the size limit, NODES responses are sent as multiple messages
and specify the total number of responses in the message.

Since low-latency communication is expected, implementations should place short timeouts
on request/response interactions. Good timeout values are 500ms for a single
request/response and 1s for the handshake.

When responding to a request, the response should be sent to the UDP envelope address of
the request.

## Handshake

Discovery communication is encrypted and authenticated using session keys, established in
the handshake. Since every node participating in the network acts as both client and
server, a handshake can be initiated by either side of communication at any time. In the
following definitions, we assume that node A wishes to communicate with node B, e.g. to
send a FINDNODE query.

Node A must have a node record for node B and know B's node ID to communicate with it. If
node A has session keys from prior communication, it encrypts its request with those keys.
If no keys are known, it initiates the handshake by sending a packet with random content.

    A -> B   FINDNODE (encrypted with unknown key) or random-packet

Node B receives the initial packet, extracts the source node ID from the packet's `tag`
(see [encoding section]) and continues the handshake by responding with WHOAREYOU. The
WHOAREYOU packet contains a nonce value to be signed by A as well as the highest known ENR
sequence number of node A's record.

    A <- B   WHOAREYOU (including id-nonce, enr-seq)

Node A now knows that node B is alive and can send it's initial packet again. Alongside
the encrypted packet, node A includes an ephemeral public key in the cryptosystem used by
B's identity scheme (e.g. an elliptic curve key on the secp256k1 curve if node B uses the
"v4" scheme).

The ephemeral key is used to perform Diffie-Hellman key agreement with B's static public
key and the session keys are derived from it using the HKDF key derivation function.

    ephemeral-key    = random private key
    ephemeral-pubkey = public key corresponding to ephemeral-key
    dest-pubkey      = public key of B
    secret           = ecdh(ephemeral-key, dest-pubkey)
    info             = "discovery v5 key agreement" || node-id-A || node-id-B
    prk              = HKDF-Extract(secret, id-nonce)

    initiator-key, recipient-key, auth-resp-key = HKDF-Expand(prk, info)

The authentication header also contains an encrypted signature over `id-nonce` (preventing
replay of the handshake) as well as node A's node record if the local sequence number is
higher than `enr-seq`.

    A -> B   FINDNODE (with authentication header, encrypted with new initiator-write-key)

Node B receives the packet and performs key agreement/derivation with its static private
key and the `ephemeral-key`. It can now decrypt the header values and verify that the
signature over `id-nonce` was created by node A's public key. To verify the signature it
looks at node A's record which it either already has a copy of or which was received in
the header.

If the `id-nonce` signature is valid, Node B considers the new session keys valid,
decrypts the message contained in the packet and responds to it. In our example case, the
response is a `NODES` message:

    A <- B   NODES (encrypted with new recipient-write-key)

Node A receives the response and authenticates/decrypts it with the new session keys. If
decryption succeeds node B's identity is verified, A considers the new session keys valid
and uses them for all further communication.

### Handshake Implementation Considerations

Since a handshake may happen at any time, implementations should keep a reference to all
sent request packets until the request either times out, is answered by the corresponding
response packet or answered by WHOAREYOU. If WHOAREYOU is received as the answer to a
request, the request must be re-sent with an authentication header containing new keys.

Multiple responses may be pending when WHOAREYOU is received, as in the following example:

    A -> B   FINDNODE
    A -> B   PING
    A -> B   TOPICQUERY
    A <- B   WHOAREYOU (token references PING)

In those cases, pending requests can be considered invalid (the remote end cannot decrypt
them) and the packet referenced by WHOAREYOU (example: PING) must be re-sent with an
authentication header. When the response to the re-sent request (example: PONG) is
received, the new session is established and other pending requests (example: FINDNODE,
TOPICQUERY) may be re-sent.

Note that WHOAREYOU is only ever valid as a response to a previously sent request. If
WHOAREYOU is received but no requests are pending, the handshake attempt can be ignored.

Implementations should be careful about AES-GCM nonces because encrypting two messages
with the same nonce compromises the key. Session keys should be kept in memory for a
limited amount of time, ensuring that nodes occasionally perform a handshake to establish
new keys.

Implementations should also ensure that session secrets and the handshake are tied to a
specific UDP endpoint. This is simple to implement by using the node ID and IP/port as the
key into the in-memory session cache. When a node switches endpoints, e.g. when roaming
between different wireless networks, sessions will to be re-established by re-handshaking.
This requires no effort on behalf of the roaming node because the recipients of protocol
messages will simply refuse to decrypt messages from the new endpoint and reply with
WHOAREYOU.

**TBD: concurrent handshake tie-breaker rule.**

### Identity-Specific Cryptography in the Handshake

Establishment of session keys is dependent on the identity scheme of the recipient (i.e.
the node which sends WHOAREYOU). Similarly, the signature over `id-nonce-input` is made by
the identity key of the initiator. Although initiator and recipient might not be using the
same identity scheme in their respective node records, implementations must be able to
handle handshaking for all supported identity schemes.

At this time, the only supported identity scheme is "v4".

`id_sign(data)` creates a signature over `data` using the node's static private key. The
signature is encoded as the 64-byte array `r || s`, i.e. as the concatenation of the
signature values.

`ecdh(pubkey, privkey)` creates a secret through elliptic-curve Diffie-Hellman key
agreement. The public key is multiplied by the private key to create a secret ephemeral
key `eph = pubkey * privkey`. The 33-byte secret output is `y || eph.x` where `y` is
`0x02` when `eph.y` is even or `0x03` when `eph.y` is odd.

## Packet Encoding

All regular packets except WHOAREYOU start with a fixed-size `tag`. For a packet sent by
node A to node B:

    tag              = xor(sha256(dest-node-id), src-node-id)
    dest-node-id     = 32-byte node ID of B
    src-node-id      = 32-byte node ID of A

The recipient can recover the sender's ID by performing the same calculation in reverse.

    src-node-id      = xor(sha256(dest-node-id), tag)

The encoding of the 'random packet', sent if no session keys are available, is:

    random-packet    = tag || rlp_bytes(auth-tag) || random-data
    auth-tag         = 12 random bytes unique to message
    random-data      = at least 44 bytes of random data

The WHOAREYOU packet, used during the handshake, is encoded as follows:

    whoareyou-packet = magic || [token, id-nonce, enr-seq]
    magic            = sha256(dest-node-id || "WHOAREYOU")
    token            = auth-tag of request
    id-nonce         = 32 random bytes
    enr-seq          = highest ENR sequence number of node A known on node B's side

The first encrypted message sent in response to WHOAREYOU contains an authentication
header completing the handshake. The plain text of the authentication response is.

    auth-response-pt = [version, id-nonce-sig, node-record]
    version          = 5
    id-nonce-input   = sha256("discovery-id-nonce" || id-nonce || ephemeral-key)
    id-nonce-sig     = id_sign(id-nonce-input)
    static-node-key  = the private key used for node record identity
    node-record      = record of sender OR [] if enr-seq in WHOAREYOU != current seq

`auth-response-pt` is encrypted with a separate key, the `auth-resp-key`, using an
all-zero nonce. This is safe because only one message is ever encrypted with this key.

    message-packet   = tag || auth-header || message
    auth-header      = [auth-tag, id-nonce, auth-scheme-name, ephemeral-pubkey, auth-response]
    auth-scheme-name = "gcm"
    auth-response    = aesgcm_encrypt(auth-resp-key, zero-nonce, auth-response-pt, "")
    zero-nonce       = 12 zero bytes
    message          = aesgcm_encrypt(initiator-key, auth-tag, message-pt, tag)
    message-pt       = message-type || message-data
    auth-tag         = AES-GCM nonce, 12 random bytes unique to message

All messages following the handshake are encoded as follows:

    message-packet   = tag || rlp_bytes(auth-tag) || message
    message          = aesgcm_encrypt(initiator-key, auth-tag, message-pt, tag)

Implementations can distinguish the two `message-packet` encodings by checking whether the
value at offset 32 after the fixed-size `tag` is an RLP list (`auth-header`) or byte array
(`auth-tag`).

Node records are encoded and verified as specified in [EIP-778].

## Protocol Messages

This section lists all defined messages which can be sent and received. The hexadecimal
value in brackets is the `message-type`.

The first element of every `message-data` list is the request ID. For requests, this value
is assigned by the requester. The recipient of a message must mirror the value in the
request ID element of the response.

The value selected as request ID must allow for concurrent conversations. Using a
timestamp can result in parallel conversations with the same id, so this should be
avoided. Request IDs also prevent replay of responses. Using a simple counter would be
fine if the implementation could ensure that restarts or even re-installs would increment
the counter based on previously saved state in all circumstances. The easiest to implement
is a random number.

### PING Request (0x01)

    message-data = [request-id, enr-seq]
    message-type = 0x01
    enr-seq      = local ENR sequence number of sender

PING checks whether the recipient is alive and informs it about the sender's ENR sequence
number.

### PONG Response (0x02)

    message-data   = [request-id, enr-seq, recipient-ip, recipient-port]
    message-type   = 0x02
    enr-seq        = ENR sequence number of sender
    recipient-ip   = 16 or 4 byte IP address of the intended recipient
    recipient-port = recipient UDP port, a 16-bit integer

PONG is the reply to PING.

### FINDNODE Request (0x03)

    message-data = [request-id, distance]
    message-type = 0x03
    distance     = the requested log2 distance, a positive integer

FINDNODE queries for nodes at the given logarithmic distance from the recipient's node ID.
The node IDs of all nodes in the response must have a shared prefix length of `distance`
with the recipient's node ID. A request with distance `0` should return the recipient's
current record as the only result.

### NODES Response (0x04)

    message-data = [request-id, total, [ENR, ...]]
    message-type = 0x04
    total        = total number of responses to the request

NODES is the response to a FINDNODE or TOPICQUERY message. Multiple NODES messages may be
sent as responses to a single query.

### REGTOPIC Request (0x05)

    message-data = [request-id, topic, ENR, ticket]
    message-type = 0x07
    node-record  = current node record of sender
    ticket       = byte array containing ticket content

REGTOPIC attempts to register the sender for the given topic. If the requesting node has a
ticket from a previous registration attempt, it must present the ticket. Otherwise
`ticket` is the empty byte array (RLP: `0x80`). The ticket must be valid and its waiting
time must have elapsed before using the ticket.

REGTOPIC is always answered by a TICKET response. The requesting node may also receive a
REGCONFIRMATION response when registration is successful. It may take up to 10s for the
confirmation to be sent.

### TICKET Response (0x06)

    message-data = [request-id, ticket, wait-time]
    message-type = 0x06
    ticket       = an opaque byte array representing the ticket
    wait-time    = time to wait before registering, in seconds

TICKET is the response to REGTOPIC. It contains a ticket which can be used to register for
the requested topic after `wait-time` has elapsed. See the [theory section on tickets] for
more information.

### REGCONFIRMATION Response (0x07)

    message-data = [request-id, topic]
    message-type = 0x07
    request-id   = request-id of REGTOPIC

REGCONFIRMATION notifies the recipient about a successful registration for the given
topic. This call is sent by the advertisement medium after the time window for
registration has elapsed on a topic queue.

### TOPICQUERY Request (0x08)

    message-data = [request-id, topic]
    message-type = 0x07
    topic        = 32-byte topic hash

TOPICQUERY requests nodes in the [topic queue] of the given topic. The recipient of this
request must send one or more NODES messages containing node records registered for the
topic.

[handshake section]: #handshake
[encoding section]: #packet-encoding
[topic queue]: ./discv5-theory.md#topic-table
[theory section on tickets]: ./discv5-theory.md#tickets
[EIP-778]: ../enr.md
