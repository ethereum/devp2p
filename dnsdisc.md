# DNS Node Lists

Peer-to-peer node software often contains hard-coded bootstrap node lists. Updating those
lists requires a software update and, effort is required from the software maintainers to
ensure the list is up-to-date. As a result, the provided lists are usually small, giving
the software little choice of initial entry point into the network.

This specification describes a scheme for authenticated, updateable node lists retrievable
via DNS. In order to use such a list, the client only requires information about the DNS
name and the public key that signs the list.

DNS-based discovery was initially proposed in [EIP-1459].

## Node Lists

A 'node list' is a list of ['node records' (ENRs)](./enr.md) of arbitrary length. Lists
may refer to other lists using links. The entire list is signed using a secp256k1 private
key. The corresponding public key must be known to the client in order to verify the list.

## URL Scheme

To refer to a DNS node list, clients use a URL with 'enrtree' scheme. The URL contains the
DNS name on which the list can be found as well as the public key that signed the list.
The public key is contained in the username part of the URL and is the base32 encoding of
the compressed 32-byte binary public key.

Example:

    enrtree://AM5FCQLWIZX2QFPNJAP7VUERCCRNGRHWZG3YYHIUV7BVDQ5FDPRT2@nodes.example.org

This URL refers to a node list at the DNS name 'nodes.example.org' and is signed by the
public key

    0x049f88229042fef9200246f49f94d9b77c4e954721442714e85850cb6d9e5daf2d880ea0e53cb3ac1a75f9923c2726a4f941f7d326781baa6380754a360de5c2b6

## DNS Record Structure

The nodes in a list are encoded as a merkle tree for distribution via the DNS protocol.
Entries of the merkle tree are contained in DNS TXT records. The root of the tree is a TXT
record with the following content:

    enrtree-root:v1 e=<enr-root> l=<link-root> seq=<sequence-number> sig=<signature>

where

- `enr-root` and `link-root` refer to the root hashes of subtrees containing nodes and
  links subtrees.
- `sequence-number` is the tree's update sequence number, a decimal integer.
- `signature` is a 65-byte secp256k1 EC signature over the keccak256 hash of the record
  content, excluding the `sig=` part, encoded as URL-safe base64.

Further TXT records on subdomains map hashes to one of three entry types. The subdomain
name of any entry is the base32 encoding of the (abbreviated) keccak256 hash of its text
content.

- `enrtree-branch:<h₁>,<h₂>,...,<hₙ>` is an intermediate tree entry containing hashes of
  subtree entries.
- `enrtree://<key>@<fqdn>` is a leaf pointing to a different list located at another fully
  qualified domain name. Note that this format matches the URL encoding. This type of
  entry may only appear in the subtree pointed to by `link-root`.
- `enr:<node-record>` is a leaf containing a node record. The node record is encoded as a
  URL-safe base64 string. Note that this type of entry matches the canonical ENR text
  encoding. It may only appear in the `enr-root` subtree.

No particular ordering or structure is defined for the tree. Whenever the tree is updated,
its sequence number should increase. The content of any TXT record should be small enough
to fit into the 512 byte limit imposed on UDP DNS packets. This limits the number of
hashes that can be placed into an `enrtree-branch` entry.

Example in zone file format:

    ; name                        ttl     class type  content
    @                             60      IN    TXT   enrtree-root:v1 e=JWXYDBPXYWG6FX3GMDIBFA6CJ4 l=C7HRFPF3BLGF3YR4DY5KX3SMBE seq=1 sig=o908WmNp7LibOfPsr4btQwatZJ5URBr2ZAuxvK4UWHlsB9sUOTJQaGAlLPVAhM__XJesCHxLISo94z5Z2a463gA
    C7HRFPF3BLGF3YR4DY5KX3SMBE    86900   IN    TXT   enrtree://AM5FCQLWIZX2QFPNJAP7VUERCCRNGRHWZG3YYHIUV7BVDQ5FDPRT2@morenodes.example.org
    JWXYDBPXYWG6FX3GMDIBFA6CJ4    86900   IN    TXT   enrtree-branch:2XS2367YHAXJFGLZHVAWLQD4ZY,H4FHT4B454P6UXFD7JCYQ5PWDY,MHTDO6TMUBRIA2XWG5LUDACK24
    2XS2367YHAXJFGLZHVAWLQD4ZY    86900   IN    TXT   enr:-HW4QOFzoVLaFJnNhbgMoDXPnOvcdVuj7pDpqRvh6BRDO68aVi5ZcjB3vzQRZH2IcLBGHzo8uUN3snqmgTiE56CH3AMBgmlkgnY0iXNlY3AyNTZrMaECC2_24YYkYHEgdzxlSNKQEnHhuNAbNlMlWJxrJxbAFvA
    H4FHT4B454P6UXFD7JCYQ5PWDY    86900   IN    TXT   enr:-HW4QAggRauloj2SDLtIHN1XBkvhFZ1vtf1raYQp9TBW2RD5EEawDzbtSmlXUfnaHcvwOizhVYLtr7e6vw7NAf6mTuoCgmlkgnY0iXNlY3AyNTZrMaECjrXI8TLNXU0f8cthpAMxEshUyQlK-AM0PW2wfrnacNI
    MHTDO6TMUBRIA2XWG5LUDACK24    86900   IN    TXT   enr:-HW4QLAYqmrwllBEnzWWs7I5Ev2IAs7x_dZlbYdRdMUx5EyKHDXp7AV5CkuPGUPdvbv1_Ms1CPfhcGCvSElSosZmyoqAgmlkgnY0iXNlY3AyNTZrMaECriawHKWdDRk2xeZkrOXBQ0dfMFLHY4eENZwdufn1S1o

## Client Protocol

To find nodes at a given DNS name, say "mynodes.org":

1. Resolve the TXT record of the name and check whether it contains a valid
   "enrtree-root=v1" entry. Let's say the `enr-root` hash contained in the entry is
   "CFZUWDU7JNQR4VTCZVOJZ5ROV4".
2. Verify the signature on the root against the known public key and check whether the
   sequence number is larger than or equal to any previous number seen for that name.
3. Resolve the TXT record of the hash subdomain, e.g.
   "CFZUWDU7JNQR4VTCZVOJZ5ROV4.mynodes.org" and verify whether the content matches the
   hash.
4. The next step depends on the entry type found:
   - for `enrtree-branch`: parse the list of hashes and continue resolving them (step 3).
   - for `enr`: decode, verify the node record and import it to local node storage.

During traversal, the client must track hashes and domains which are already resolved to
avoid going into an infinite loop. It's in the client's best interest to traverse the tree
in random order.

Client implementations should avoid downloading the entire tree at once during normal
operation. It's much better to request entries via DNS when-needed, i.e. at the time when
the client is looking for peers.

## Rationale

DNS is used because it is a low-latency protocol that is pretty much guaranteed to be
available.

Being a merkle tree, any node list can be authenticated by a single signature on the root.
Hash subdomains protect the integrity of the list. At worst intermediate resolvers can
block access to the list or disallow updates to it, but cannot corrupt its content. The
sequence number prevents replacing the root with an older version.

Synchronizing updates on the client side can be done incrementally, which matters for
large lists. Individual entries of the tree are small enough to fit into a single UDP
packet, ensuring compatibility with environments where only basic UDP DNS can be used. The
tree format also works well with caching resolvers: only the root of the tree needs a
short TTL. Intermediate entries and leaves can be cached for days.

### Why does the link subtree exist?

Links between lists enable federation and web-of-trust functionality. The operator of a
large list can delegate maintenance to other list providers. If two node lists link to
each other, users can use either list and get nodes from both.

The link subtree is separate from the tree containing ENRs. This is done to enable client
implementations to sync these trees independently. A client wanting to get as many nodes
as possible will sync the link tree first and add all linked names to the sync horizon.

## References

1. The base64 and base32 encodings used to represent binary data are defined in [RFC
   4648]. No padding is used for base64 and base32 data.

[EIP-1459]: https://eips.ethereum.org/EIPS/eip-1459
[RFC 4648]: https://tools.ietf.org/html/rfc4648
