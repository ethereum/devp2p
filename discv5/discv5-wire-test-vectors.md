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
    4c4f53245d08dab84102ed931f66d1492acb308fa1c6715b9d139b81acbdcc

WHOAREYOU packet (flag 1):

    # src-node-id = 0xaaaa8419e9f49d0083561b48287df592939a8d19947d8c0ef88f2a4856a69fbb
    # dest-node-id = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9
    # whoareyou.challenge-data = 0x000000000000000000000000000000006469736376350001010102030405060708090a0b0c00180102030405060708090a0b0c0d0e0f100000000000000000
    # whoareyou.request-nonce = 0x0102030405060708090a0b0c
    # whoareyou.id-nonce = 0x0102030405060708090a0b0c0d0e0f10
    # whoareyou.enr-seq = 0

    00000000000000000000000000000000088b3d434277464933a1ccc59f5967ad
    1d6035f15e528627dde75cd68292f9e6c27d6b66c8100a873fcbaed4e16b8d

Ping handshake packet (flag 2):

    # src-node-id = 0xaaaa8419e9f49d0083561b48287df592939a8d19947d8c0ef88f2a4856a69fbb
    # dest-node-id = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9
    # nonce = 0xffffffffffffffffffffffff
    # read-key = 0x4f9fac6de7567d1e3b1241dffe90f662
    # ping.req-id = 0x00000001
    # ping.enr-seq = 1
    #
    # handshake inputs:
    #
    # whoareyou.challenge-data = 0x000000000000000000000000000000006469736376350001010102030405060708090a0b0c00180102030405060708090a0b0c0d0e0f100000000000000001
    # whoareyou.request-nonce = 0x0102030405060708090a0b0c
    # whoareyou.id-nonce = 0x0102030405060708090a0b0c0d0e0f10
    # whoareyou.enr-seq = 1
    # ephemeral-key = 0x0288ef00023598499cb6c940146d050d2b1fb914198c327f76aad590bead68b6
    # ephemeral-pubkey = 0x039a003ba6517b473fa0cd74aefe99dadfdb34627f90fec6362df85803908f53a5

    00000000000000000000000000000000088b3d4342774649305f313964a39e55
    ea96c005ad521d8c7560413a7008f16c9e6d2f43bbea8814a546b7409ce783d3
    4c4f53245d08da4bb252012b2cba3f4f374a90a75cff91f142fa9be3e0a5f3ef
    268ccb9065aeecfd67a999e7fdc137e062b2ec4a0eb92947f0d9a74bfbf44dfb
    a776b21301f8b65efd5796706adff216ab862a9186875f9494150c4ae06fa4d1
    f0396c93f215fa4ef524f1eadf5f0f4126b79336671cbcf7a885b1f8bd2a5d83
    9cf8

Ping handshake message packet (flag 2, with ENR):

    # src-node-id = 0xaaaa8419e9f49d0083561b48287df592939a8d19947d8c0ef88f2a4856a69fbb
    # dest-node-id = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9
    # nonce = 0xffffffffffffffffffffffff
    # read-key = 0x53b1c075f41876423154e157470c2f48
    # ping.req-id = 0x00000001
    # ping.enr-seq = 1
    #
    # handshake inputs:
    #
    # whoareyou.challenge-data = 0x000000000000000000000000000000006469736376350001010102030405060708090a0b0c00180102030405060708090a0b0c0d0e0f100000000000000000
    # whoareyou.request-nonce = 0x0102030405060708090a0b0c
    # whoareyou.id-nonce = 0x0102030405060708090a0b0c0d0e0f10
    # whoareyou.enr-seq = 0
    # ephemeral-key = 0x0288ef00023598499cb6c940146d050d2b1fb914198c327f76aad590bead68b6
    # ephemeral-pubkey = 0x039a003ba6517b473fa0cd74aefe99dadfdb34627f90fec6362df85803908f53a5

    00000000000000000000000000000000088b3d4342774649305f313964a39e55
    ea96c005ad539c8c7560413a7008f16c9e6d2f43bbea8814a546b7409ce783d3
    4c4f53245d08da4bb23698868350aaad22e3ab8dd034f548a1c43cd246be9856
    2fafa0a1fa86d8e7a3b95ae78cc2b988ded6a5b59eb83ad58097252188b902b2
    1481e30e5e285f19735796706adff216ab862a9186875f9494150c4ae06fa4d1
    f0396c93f215fa4ef524e0ed04c3c21e39b1868e1ca8105e585ec17315e755e6
    cfc4dd6cb7fd8e1a1f55e49b4b5eb024221482105346f3c82b15fdaae36a3bb1
    2a494683b4a3c7f2ae41306252fed84785e2bbff3b022812d0882f06978df84a
    80d443972213342d04b9048fc3b1d5fcb1df0f822152eced6da4d3f6df27e70e
    4539717307a0208cd208d65093ccab5aa596a34d7511401987662d8cf62b1394
    71

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
    challenge-data = 0x000000000000000000000000000000006469736376350001010102030405060708090a0b0c00180102030405060708090a0b0c0d0e0f100000000000000000

The expected outputs, resulting from the HKDF-EXPAND function.

    initiator-key = 0xdccc82d81bd610f4f76d3ebe97a40571
    recipient-key = 0xac74bb8773749920b0d3a8881c173ec5

### ID Nonce Signing

This test vector checks the ID signature as used by the handshake.
The `static-key` is the secp256k1 private key used for signing.

    static-key = 0xfb757dc581730490a1d7a00deea65e9b1936924caaea8f44d476014856b68736
    challenge-data = 0x000000000000000000000000000000006469736376350001010102030405060708090a0b0c00180102030405060708090a0b0c0d0e0f100000000000000000
    ephemeral-pubkey = 0x039961e4c2356d61bedb83052c115d311acb3a96f5777296dcf297351130266231
    node-id-B = 0xbbbb9d047f0488c0b5a93c1c3f2d8bafc7c8ff337024a55434a0d0555de64db9

The expected output is the `id-signature`. You can also apply this test vector in reverse
by verifying the signature against the inputs above.

    id-signature = 0x94852a1e2318c4e5e9d422c98eaf19d1d90d876b29cd06ca7cb7546d0fff7b484fe86c09a064fe72bdbef73ba8e9c34df0cd2b53e9d65528c2c7f336d5dfc6e6

### Encryption/Decryption

This test vector demonstrates the `AES_GCM` encryption/decryption used in the wire
protocol.

    encryption-key: 0x9f2d77db7004bf8a1a85107ac686990b
    nonce: 0x27b5af763c446acd2749fe8e
    pt: 0x01c20101
    ad: 0x93a7400fa0d6a694ebc24d5cf570f65d04215b6ac00757875e3f3a5f42107903

Note that the 16 byte MAC is prepended to the ciphertext.

    message-ciphertext: 0xa5d12a2d94b8ccb3ba55558229867dc13bfa3648
