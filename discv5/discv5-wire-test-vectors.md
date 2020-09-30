# Test Vectors

This document provides a collection of test vectors for the Discovery v5 wire protocol
aimed to aid new implementations conform to the specification.

## Packet Encodings

This section provides test vectors for the different packet types. Your implementation
should load the `node-b-key` and then be able to decrypt and authenticate these as-is.

The secp256k1 private keys used here are:

    node-a-key = 0xeef77acb6c6a6eebc5b363a475ac583ec7eccdb42b6481424c60f59aa326547f
    node-b-key = 0x66fb62bfbd66b9177a138c1e5cddbe4f7c30c343e94e68df8769459cb1cde628

Ping message packet (flag 0):

    # src-node-id = 0xaaaa8419e9f49d0083561b48287df592939a8d19947d8c0ef88f2a4856a69fbb
    # dest-node-id = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9
    # nonce = 0xffffffffffffffffffffffff
    # read-key = 0x00000000000000000000000000000000
    # ping.req-id = 0x00000001
    # ping.enr-seq = 2

    00000000000000000000000000000000088b3d4342774649325f313964a39e55
    ea96c005ad52be8c7560413a7008f16c9e6d2f43bbea8814a546b7409ce783d3
    4c4f53245d08dab84102ed931f66d1db57c785865ffccae8689057103acb15

WHOAREYOU packet (flag 1):

    # dest-node-id = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9
    # whoareyou.iv = 0x00000000000000000000000000000000
    # whoareyou.authdata = 0x0102030405060708090a0b0c0d0e0f100000000000000000
    # whoareyou.request-nonce = 0x0102030405060708090a0b0c
    # whoareyou.id-nonce = 0x0102030405060708090a0b0c0d0e0f10
    # whoareyou.enr-seq = 0

    00000000000000000000000000000000088b3d434277464933a1ccc59f5967ad
    1d6035f15e528627dde75cd68292f9e6c27d6b66c8100a873fcbaed4e16b8d

Ping handshake packet (flag 2):

    # src-node-id = 0xaaaa8419e9f49d0083561b48287df592939a8d19947d8c0ef88f2a4856a69fbb
    # dest-node-id = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9
    # nonce = 0xffffffffffffffffffffffff
    # read-key = 0xf901161aebd1298aa813621ad0c05343
    # ping.req-id = 0x00000001
    # ping.enr-seq = 1
    #
    # handshake inputs:
    #
    # whoareyou.iv = 0x00000000000000000000000000000000
    # whoareyou.authdata = 0x0102030405060708090a0b0c0d0e0f100000000000000001
    # whoareyou.request-nonce = 0x0102030405060708090a0b0c
    # whoareyou.id-nonce = 0x0102030405060708090a0b0c0d0e0f10
    # whoareyou.enr-seq = 1
    # ephemeral-key = 0x0288ef00023598499cb6c940146d050d2b1fb914198c327f76aad590bead68b6
    # ephemeral-pubkey = 0x039a003ba6517b473fa0cd74aefe99dadfdb34627f90fec6362df85803908f53a5

    00000000000000000000000000000000088b3d4342774649305f313964a39e55
    ea96c005ad521d8c7560413a7008f16c9e6d2f43bbea8814a546b7409ce783d3
    4c4f53245d08da4bb265bd5b8f27e00bcb6f1b193f52eb737dbb3033ee890cab
    bd2728dfa01b3613a2a3a6edc1e2b4359f45c4823db4e5a91132d68606508845
    772fbdd366664b350f5796706adff216ab862a9186875f9494150c4ae06fa4d1
    f0396c93f215fa4ef524dc394f221e162100550a011363be21154c6b42e3816f
    0a38

Ping handshake message packet (flag 2, with ENR):

    # src-node-id = 0xaaaa8419e9f49d0083561b48287df592939a8d19947d8c0ef88f2a4856a69fbb
    # dest-node-id = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9
    # nonce = 0xffffffffffffffffffffffff
    # read-key = 0xf901161aebd1298aa813621ad0c05343
    # ping.req-id = 0x00000001
    # ping.enr-seq = 1
    #
    # handshake inputs:
    #
    # whoareyou.iv = 0x00000000000000000000000000000000
    # whoareyou.authdata = 0x0102030405060708090a0b0c0d0e0f100000000000000000
    # whoareyou.request-nonce = 0x0102030405060708090a0b0c
    # whoareyou.id-nonce = 0x0102030405060708090a0b0c0d0e0f10
    # whoareyou.enr-seq = 0
    # ephemeral-key = 0x0288ef00023598499cb6c940146d050d2b1fb914198c327f76aad590bead68b6
    # ephemeral-pubkey = 0x039a003ba6517b473fa0cd74aefe99dadfdb34627f90fec6362df85803908f53a5

    00000000000000000000000000000000088b3d4342774649305f313964a39e55
    ea96c005ad539c8c7560413a7008f16c9e6d2f43bbea8814a546b7409ce783d3
    4c4f53245d08da4bb2f6dcb382c5d8d278b57f348cdc967ebf060aca235dd420
    9711826d77482afb37b6106070af606add9d8a8bb052a35eeed1d9cf829d2d73
    821b4b506b5600498c5796706adff216ab862a9186875f9494150c4ae06fa4d1
    f0396c93f215fa4ef524e0ed04c3c21e39b1868e1ca8105e585ec17315e755e6
    cfc4dd6cb7fd8e1a1f55e49b4b5eb024221482105346f3c82b15fdaae36a3bb1
    2a494683b4a3c7f2ae41306252fed84785e2bbff3b022812d0882f06978df84a
    80d443972213342d04b9048fc3b1d5fcb1df0f822152eced6da4d3f6df27e70e
    4539717307a0208cd2dc394f221e162100550a011363be21154c6b42e3816f0a
    38

## Cryptographic Primitives

This section provides test vectors for the currently supported "v4" identity scheme.

### ECDH

The ECDH function takes the elliptic-curve scalar multiplication of a public key and a
private key. The wire protocol describes this process.

    public-key = 0x039961e4c2356d61bedb83052c115d311acb3a96f5777296dcf297351130266231
    secret-key = 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736

This output is the result of the ECDH function which will be used by the KDF.

    shared-secret = 0x033b11a2a1f214567e1537ce5e509ffd9b21373247f2a3ff6841f4976f53165e7e

### Key Derivation

This test vector checks the complete key derivation as used by the handshake.

    ephemeral-key = 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736
    dest-pubkey = 0x0317931e6e0840220642f230037d285d122bc59063221ef3226b1f403ddc69ca91
    node-id-a = 0xaaaa8419e9f49d0083561b48287df592939a8d19947d8c0ef88f2a4856a69fbb
    node-id-b = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9
    whoareyou.masking-iv = 0x01010101010101010101010101010101
    whoareyou.id-nonce = 0x02020202020202020202020202020202

The expected outputs, resulting from the HKDF-EXPAND function.

    initiator-key = 0xb10e94a89b34cfb87b65aa7f8902f40c
    recipient-key = 0xce8db25ae599c9b2c4a9d60090c9efdd

### ID Nonce Signing

This test vector checks the ID signature as used by the handshake.\
The `static-key` is the secp256k1 private key used for signing.

    static-key = 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736
    masking-iv = 0x01010101010101010101010101010101
    authdata = 0x0102030405060708090a0b0c0d0e0f100000000000000000
    ephemeral-pubkey = 0x039961e4c2356d61bedb83052c115d311acb3a96f5777296dcf297351130266231
    node-id-B = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9

The expected output is the `id-signature`. You can also apply this test vector in reverse
by verifying the signature against the inputs above.

    id-signature = 0xd82364cfffb18101355371de84ee0def3dca31191b9add79b21a14f4442b6df02dc26df6278f71c83d43645da13071881cacdb43b0aea1e256cdec73a73faf01

### Encryption/Decryption

This test vector demonstrates the `AES_GCM` encryption/decryption used in the wire
protocol.

    encryption-key: 0x9f2d77db7004bf8a1a85107ac686990b
    nonce: 0x27b5af763c446acd2749fe8e
    pt: 0x01c20101
    ad: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f42107903

Note that the 16 byte MAC is prepended to the ciphertext.

    message-ciphertext: 0xa5d12a2d94b8ccb3ba55558229867dc13bfa3648
