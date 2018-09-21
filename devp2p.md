# devp2p Application Protocol

devp2p is an application-layer networking protocol for communication among nodes in a
peer-to-peer network. Nodes may support any number of sub-protocols. devp2p handles
negotiation of supported sub-protocols on both sides and carries their messages over a
single connection.

### Low-Level

Nodes communicate by sending messages using RLPx. Nodes are free to advertise and accept
connections on any TCP ports they wish, however, a default port on which the connection
may be listened and made will be 30303. Though TCP provides a connection-oriented medium,
devp2p nodes communicate in terms of packets. RLPx provides facilities to send and receive
packets. For more information about RLPx, refer to the [RLPx specification][rlpx].

devp2p nodes find peers through the [discovery protocol][discv4] DHT. Peer connections can
also be initiated by supplying the endpoint of a peer to a client-specific RPC API.

### Message Contents

Messages are encoded using the [RLP serialization format][rlp].

There are a number of different types of payload that may be encoded within the message.
This 'type' is always determined by the first entry of the packet RLP, interpreted as an
integer.

devp2p is designed to support arbitrary sub-protocols (aka _capabilities_) over the basic
wire protocol. Each sub-protocol is given as much of the message-ID space as it needs. All
such protocols must statically specify how many message IDs they require. On connection
and reception of the `Hello` message, both peers have equivalent information about what
subprotocols they share (including versions) and are able to form consensus over the
composition of message ID space.

Message IDs are assumed to be compact from ID 0x10 onwards (0x00-0x10 is reserved for
devp2p messages) and given to each shared (equal-version, equal name) sub-protocol in
alphabetic order. Sub-protocols that are not shared are ignored. If multiple versions are
shared of the same (equal name) sub-protocol, the numerically highest wins, others are
ignored.

### "p2p" Sub-protocol Messages

**Hello** `0x00` [`p2pVersion`: `P`, `clientId`: `B`, [[`cap1`: `B_3`, `capVersion1`:
`P`], [`cap2`: `B_3`, `capVersion2`: `P`], `...`], `listenPort`: `P`, `nodeId`: `B_64`]
First packet sent over the connection, and sent once by both sides. No other messages may
be sent until a Hello is received.

* `p2pVersion` Specifies the implemented version of the P2P protocol. Now must be 1.
* `clientId` Specifies the client software identity, as a human-readable string (e.g.
  "Ethereum(++)/1.0.0").
* `cap` Specifies a peer capability name as an ASCII string, e.g. "eth" for the eth subprotocol.
* `capVersion` Specifies a peer capability version as a positive integer.
* `listenPort` specifies the port that the client is listening on (on the interface that
  the present connection traverses). If 0 it indicates the client is not listening.
* `nodeId` is the unique identity of the node and specifies a 512-bit secp256k1 public key that identifies this node.

**Disconnect** `0x01` [`reason`: `P`] Inform the peer that a disconnection is imminent; if
received, a peer should disconnect immediately. When sending, well-behaved hosts give
their peers a fighting chance (read: wait 2 seconds) to disconnect to before disconnecting
themselves.

* `reason` is an optional integer specifying one of a number of reasons for disconnect:
  * `0x00` Disconnect requested;
  * `0x01` TCP sub-system error;
  * `0x02` Breach of protocol, e.g. a malformed message, bad RLP, incorrect magic number
    &c.;
  * `0x03` Useless peer;
  * `0x04` Too many peers;
  * `0x05` Already connected;
  * `0x06` Incompatible P2P protocol version;
  * `0x07` Null node identity received - this is automatically invalid;
  * `0x08` Client quitting;
  * `0x09` Unexpected identity (i.e. a different identity to a previous connection/what a
    trusted peer told us).
  * `0x0a` Identity is the same as this node (i.e. connected to itself);
  * `0x0b` Timeout on receiving a message (i.e. nothing received since sending last ping);
  * `0x10` Some other reason specific to a subprotocol.

**Ping** `0x02` [] Requests an immediate reply of `Pong` from the peer.

**Pong** `0x03` [] Reply to peer's `Ping` packet.

### Session Management

Upon connecting, all clients (i.e. both sides of the connection) must send a `Hello`
message. Upon receiving the `Hello` message and verifying compatibility of the network and
versions, a session is active and any other P2P messages may be sent.

At any time, a `Disconnect` message may be sent.

[rlp]: https://github.com/ethereum/wiki/wiki/RLP
[rlpx]: https://github.com/ethereum/devp2p/tree/master/rlpx.md
[discv4]: https://github.com/ethereum/devp2p/tree/master/discv4.md
