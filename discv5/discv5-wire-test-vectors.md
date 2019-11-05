# Test Vectors

This document provides a collection of test vectors for the discovery v5 wire
protocol aimed to aid new implementations conform to the specification.

## Packet Encodings

This section provides test vectors for each individual packet type. These tests
primarily test for correct RLP encoding in the packet types.

### Random Packet

#### Input Parameters

    tag: 0x0101010101010101010101010101010101010101010101010101010101010101
    auth-tag: 0x020202020202020202020202
    random-data: 0x0404040404040404040404040404040404040404040404040404040404040404040404040404040404040404

#### Expected Output

    random-packet-rlp: 0x01010101010101010101010101010101010101010101010101010101010101018c0202020202020202020202020404040404040404040404040404040404040404040404040404040404040404040404040404040404040404

### WHOAREYOU Packet

#### Input Parameters

    magic: 0x0101010101010101010101010101010101010101010101010101010101010101
    token: 0x020202020202020202020202
    id-nonce: 0x0303030303030303030303030303030303030303030303030303030303030303
    enr-seq: 0x01

#### Expected Output

    whoareyou-packet-rlp: 0101010101010101010101010101010101010101010101010101010101010101ef8c020202020202020202020202a0030303030303030303030303030303030303030303030303030303030303030301

### Authenticated Message Packet

#### Input Parameters

    tag: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f42107903
    auth-tag: 0x27b5af763c446acd2749fe8e
    id-nonce: 0xe551b1c44264ab92bc0b3c9b26293e1ba4fed9128f3c3645301e8e119f179c65
    ephemeral-pubkey: 0xb35608c01ee67edff2cffa424b219940a81cf2fb9b66068b1cf96862a17d353e22524fbdcdebc609f85cbd58ebe7a872b01e24a3829b97dd5875e8ffbc4eea81
    auth-resp-ciphertext: 0x570fbf23885c674867ab00320294a41732891457969a0f14d11c995668858b2ad731aa7836888020e2ccc6e0e5776d0d4bc4439161798565a4159aa8620992fb51dcb275c4f755c8b8030c82918898f1ac387f606852
    message-ciphertext: 0xa5d12a2d94b8ccb3ba55558229867dc13bfa3648

#### Expected Output

    auth-message-rlp: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f42107903f8cc8c27b5af763c446acd2749fe8ea0e551b1c44264ab92bc0b3c9b26293e1ba4fed9128f3c3645301e8e119f179c658367636db840b35608c01ee67edff2cffa424b219940a81cf2fb9b66068b1cf96862a17d353e22524fbdcdebc609f85cbd58ebe7a872b01e24a3829b97dd5875e8ffbc4eea81b856570fbf23885c674867ab00320294a41732891457969a0f14d11c995668858b2ad731aa7836888020e2ccc6e0e5776d0d4bc4439161798565a4159aa8620992fb51dcb275c4f755c8b8030c82918898f1ac387f606852a5d12a2d94b8ccb3ba55558229867dc13bfa3648

### Message Packet

#### Input Parameters

    tag: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f42107903
    auth-tag: 0x27b5af763c446acd2749fe8e
    message-ciphertext: 0xa5d12a2d94b8ccb3ba55558229867dc13bfa3648

#### Expected Output

    message-rlp: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f421079038c27b5af763c446acd2749fe8ea5d12a2d94b8ccb3ba55558229867dc13bfa3648

## Protocol Message Encodings

This section provides test vectors for individual protocol messages defined in
the wire protocol. These tests primarily verify the RLP encoding of each
protocol message.

### Ping Request

#### Input Parameters

    id: 0x01
    enr-seq: 0x01

#### Expected Output

    ping-rlp: 0x01c20101

### Pong Response

#### Input Parameters

    id: 0x01
    enr-seq: 0x01
    recipient-ip: "127.0.0.1"
    recipient-port: 5000

#### Expected Output

    pong-rlp: 0x02ca0101847f000001821388

### FindNode Request

#### Input Parameters

    id: 0x01
    distance: 0x0100 (decimal 256)

#### Expected Output

    find-node-rlp: 0x03c401820100

### Nodes Response (Empty)

#### Input Parameters

    id: 0x01
    total: 0x01
    enr: []

#### Expected Output

    nodes-response-rlp: 04c30101c0

### Nodes Response (multiple)

#### Input Parameters

    id: 0x01
    total: 0x01
    enr-1: "enr:-HW4QBzimRxkmT18hMKaAL3IcZF1UcfTMPyi3Q1pxwZZbcZVRI8DC5infUAB_UauARLOJtYTxaagKoGmIjzQxO2qUygBgmlkgnY0iXNlY3AyNTZrMaEDymNMrg1JrLQB2KTGtv6MVbcNEVv0AHacwUAPMljNMTg"
    enr-2: "enr:-HW4QNfxw543Ypf4HXKXdYxkyzfcxcO-6p9X986WldfVpnVTQX1xlTnWrktEWUbeTZnmgOuAY_KUhbVV1Ft98WoYUBMBgmlkgnY0iXNlY3AyNTZrMaEDDiy3QkHAxPyOgWbxp5oF1bDdlYE6dLCUUp8xfVw50jU"

#### Expected Output

    nodes-response-rlp: 0x04f8f20101f8eef875b8401ce2991c64993d7c84c29a00bdc871917551c7d330fca2dd0d69c706596dc655448f030b98a77d4001fd46ae0112ce26d613c5a6a02a81a6223cd0c4edaa53280182696482763489736563703235366b31a103ca634cae0d49acb401d8a4c6b6fe8c55b70d115bf400769cc1400f3258cd3138f875b840d7f1c39e376297f81d7297758c64cb37dcc5c3beea9f57f7ce9695d7d5a67553417d719539d6ae4b445946de4d99e680eb8063f29485b555d45b7df16a1850130182696482763489736563703235366b31a1030e2cb74241c0c4fc8e8166f1a79a05d5b0dd95813a74b094529f317d5c39d235

### Ticket Request

#### Input Parameters

    id: 0x01
    topic-hash: 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

#### Expected Output

    request-ticket-rlp: 0x05e201a0fb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

### RegisterTopic Request

#### Input Parameters

    id: 0x01
    ticket: 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

#### Expected Output

    register-ticket-rlp: 0x07e201a0fb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

### RegisterTopic Response

#### Input Parameters

    id: 0x01
    registered: true

#### Expected Output

    register-ticket-response-rlp: 0x08c20101

### TopicQuery Request

#### Input Parameters

    id: 0x01
    topic-hash: 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

#### Expected Output

    topic-query-rlp: 0x09e201a0fb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

## Cryptographic Primitives

This section provides test vectors for the currently supported "v4" identity
scheme.

### ECDH

The ECDH function takes the elliptic-curve scalar multiplication of a public
key and a private key. The wire protocol describes this process.

The input public key is an uncompressed secp256k1 key (64 bytes) and the
private key is a raw secp256k1 private key (32 bytes).

#### Input Parameters

    public-key: 0x9961e4c2356d61bedb83052c115d311acb3a96f5777296dcf297351130266231503061ac4aaee666073d7e5bc2c80c3f5c5b500c1cb5fd0a76abbb6b675ad157
    secret_key: 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

#### Expected Output

This output is the result of the ECDH function which will be used as input to
the HKDF-EXTRACT and HKDF-EXPAND functions.

    shared-secret: 0x033b11a2a1f214567e1537ce5e509ffd9b21373247f2a3ff6841f4976f53165e7e

### Key Derivation

This test vector takes a secret key (as calculated from the previous test
vector) along with two node id's and an `id-nonce`. This demonstrates the
HKDF-EXPAND and HKDF-EXTRACT functions using the added key-agreement string as
described in the wire specification.

Given a secret key (calculated from ECDH above) two `node-id`s (required to
build the `info` as described in the specification) and the `id-nonce`
(required for the HKDF-EXTRACT function), this should produce an
`initiator-key`, `recipient-key` and an `auth-resp-key`.

#### Input Parameters

    secret-key: 0x02a77e3aa0c144ae7c0a3af73692b7d6e5b7a2fdc0eda16e8d5e6cb0d08e88dd04
    node-id-A: 0xa448f24c6d18e575453db13171562b71999873db5b286df957af199ec94617f7
    node-id-B: 0x885bba8dfeddd49855459df852ad5b63d13a3fae593f3f9fa7e317fd43651409
    id-nonce: 0x0101010101010101010101010101010101010101010101010101010101010101

#### Expected Outputs

The three keys, resulting from the HKDF-EXPAND function.

    initiator-key: 0x238d8b50e4363cf603a48c6cc3542967
    recipient-key: 0xbebc0183484f7e7ca2ac32e3d72c8891
    auth-resp-key: 0xe987ad9e414d5b4f9bfe4ff1e52f2fae

### Nonce Signing

Nonce signatures should prefix the string `discovery-id-nonce` and post-fix the
ephemeral key before taking the `sha256` hash of the `id-nonce`.

#### Input Parameters

The `local-secret-key` is the raw secp256k1 private key used to sign the nonce.

    id_nonce: 0xa77e3aa0c144ae7c0a3af73692b7d6e5b7a2fdc0eda16e8d5e6cb0d08e88dd04
    ephemeral-key: 0x9961e4c2356d61bedb83052c115d311acb3a96f5777296dcf297351130266231503061ac4aaee666073d7e5bc2c80c3f5c5b500c1cb5fd0a76abbb6b675ad157
    local-secret-key: 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

#### Expected Outputs

    id-nonce-sig: 0xc5036e702a79902ad8aa147dabfe3958b523fd6fa36cc78e2889b912d682d8d35fdea142e141f690736d86f50b39746ba2d2fc510b46f82ee08f08fd55d133a4

### Encryption/Decryption

This test vector demonstrates the `AES_GCM` encryption/decryption used in the wire
protocol.

#### Input Parameters

    encryption-key: 0x9f2d77db7004bf8a1a85107ac686990b
    nonce: 0x27b5af763c446acd2749fe8e
    pt: 0x01c20101
    ad: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f42107903

#### Expected Output

Note that the 16 byte MAC is prepended to the ciphertext.

    message-ciphertext: 0xa5d12a2d94b8ccb3ba55558229867dc13bfa3648

### Authentication Header and Encrypted Message Generation

This test demonstrates the construction of an authentication header. Given a
local private key, a message `tag`, the local `node-id`, an `id-nonce`, an
encryption key and a protocol message to send, one should be able to build an
encrypted message with an authentication header.

This test is broken down into stages.

1. The generation of the rlp-encoded `auth-pt` which is required in the
   authentication header
2. The Encryption of `auth-pt`
3. The generation of the authentication header itself
4. Encrypting the message and combining into an RLP-encoded `message-packet`
   with an `auth-header`

#### Part 1: Auth-pt Generation

This first section entails signature generation, and adding any ENR into
`auth-pt`. In this example, there is no ENR sent. This tests the signature
generation and correct RLP encoding of the `auth-pt` before encryption.

##### Input Parameters

    secret-key: 0x7e8107fe766b6d357205280acf65c24275129ca9e44c0fd00144ca50024a1ce7
    id-nonce: 0xe551b1c44264ab92bc0b3c9b26293e1ba4fed9128f3c3645301e8e119f179c65
    ephemeral-pubkey: 0xb35608c01ee67edff2cffa424b219940a81cf2fb9b66068b1cf96862a17d353e22524fbdcdebc609f85cbd58ebe7a872b01e24a3829b97dd5875e8ffbc4eea81
    enr: []

##### Expected Output

    auth-pt: 0xf84405b840f753ac31b017536bacd0d0238a1f849e741aef03b7ad5db1d4e64d7aa80689931f21e590edcf80ee32bb2f30707fec88fb62ea8fbcd65b9272e9a0175fea976bc0

#### Part 2: Auth-pt Encryption

The `auth-pt` must then be encrypted with AES-GCM. The auth-header uses a
12-byte 0 nonce with no authenticated data.

##### Input Parameters

    auth-resp-key: 0x8c7caa563cebc5c06bb15fc1a2d426c3
    auth-pt: 0xf84405b840f753ac31b017536bacd0d0238a1f849e741aef03b7ad5db1d4e64d7aa80689931f21e590edcf80ee32bb2f30707fec88fb62ea8fbcd65b9272e9a0175fea976bc0

##### Expected Output

    auth-resp-ciphertext: 0x570fbf23885c674867ab00320294a41732891457969a0f14d11c995668858b2ad731aa7836888020e2ccc6e0e5776d0d4bc4439161798565a4159aa8620992fb51dcb275c4f755c8b8030c82918898f1ac387f606852

#### Part 3: Auth Header Generation

An authentication header is built. This test vector demonstrates the correct
RLP-encoding of the authentication header with the above inputs.

##### Input Parameters

    auth-tag: 0x27b5af763c446acd2749fe8e
    id-nonce: 0xe551b1c44264ab92bc0b3c9b26293e1ba4fed9128f3c3645301e8e119f179c65
    ephemeral-pubkey: 0xb35608c01ee67edff2cffa424b219940a81cf2fb9b66068b1cf96862a17d353e22524fbdcdebc609f85cbd58ebe7a872b01e24a3829b97dd5875e8ffbc4eea81
    auth-resp-ciphertext: 0x570fbf23885c674867ab00320294a41732891457969a0f14d11c995668858b2ad731aa7836888020e2ccc6e0e5776d0d4bc4439161798565a4159aa8620992fb51dcb275c4f755c8b8030c82918898f1ac387f606852

##### Expected Output

    auth-header-rlp: 0xf8cc8c27b5af763c446acd2749fe8ea0e551b1c44264ab92bc0b3c9b26293e1ba4fed9128f3c3645301e8e119f179c658367636db840b35608c01ee67edff2cffa424b219940a81cf2fb9b66068b1cf96862a17d353e22524fbdcdebc609f85cbd58ebe7a872b01e24a3829b97dd5875e8ffbc4eea81b856570fbf23885c674867ab00320294a41732891457969a0f14d11c995668858b2ad731aa7836888020e2ccc6e0e5776d0d4bc4439161798565a4159aa8620992fb51dcb275c4f755c8b8030c82918898f1ac387f606852

#### Part 4: Encrypted Message

This combines the previously generated authentication header with encryption of
the protocol message, providing the final rlp-encoded message with an
authentication header.

##### Input Parameters

    tag: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f42107903
    auth-tag: 0x27b5af763c446acd2749fe8e
    auth-header-rlp: 0xf8cc8c27b5af763c446acd2749fe8ea0e551b1c44264ab92bc0b3c9b26293e1ba4fed9128f3c3645301e8e119f179c658367636db840b35608c01ee67edff2cffa424b219940a81cf2fb9b66068b1cf96862a17d353e22524fbdcdebc609f85cbd58ebe7a872b01e24a3829b97dd5875e8ffbc4eea81b856570fbf23885c674867ab00320294a41732891457969a0f14d11c995668858b2ad731aa7836888020e2ccc6e0e5776d0d4bc4439161798565a4159aa8620992fb51dcb275c4f755c8b8030c82918898f1ac387f606852
    encryption-key: 0x9f2d77db7004bf8a1a85107ac686990b
    message-plaintext: 0x01c20101

##### Expected Output

    auth-message-rlp: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f42107903f8cc8c27b5af763c446acd2749fe8ea0e551b1c44264ab92bc0b3c9b26293e1ba4fed9128f3c3645301e8e119f179c658367636db840b35608c01ee67edff2cffa424b219940a81cf2fb9b66068b1cf96862a17d353e22524fbdcdebc609f85cbd58ebe7a872b01e24a3829b97dd5875e8ffbc4eea81b856570fbf23885c674867ab00320294a41732891457969a0f14d11c995668858b2ad731aa7836888020e2ccc6e0e5776d0d4bc4439161798565a4159aa8620992fb51dcb275c4f755c8b8030c82918898f1ac387f606852a5d12a2d94b8ccb3ba55558229867dc13bfa3648
