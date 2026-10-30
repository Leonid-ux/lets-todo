# Lets Todo Device Sync v1

Local-only transport. TCP `45455`, newline-delimited JSON, UDP discovery on `45454`. No cloud endpoint is used.

## Discovery

Send `{"type":"lets-todo.discover","version":1}` over UDP. The desktop replies with `lets-todo.service`, its device id, name and TCP port. While manual pairing is active, the reply also includes `offerId`, desktop public key and expiry; the one-time code is never broadcast.

## Pairing

The QR payload is `lets-todo://pair?data=<base64url JSON>` and contains the offer id, one-time code, LAN addresses, port, desktop X25519 public key and expiry. A manual code uses the same offer.

Android sends `pair.request` with `version`, `offerId`, `code`, `device: { id, name, platform }` and its X25519 SPKI DER public key encoded as base64url. Both peers derive a 32-byte key with X25519 and HKDF-SHA256 (`salt = SHA256("lets-todo/pair/<offerId>/<code>")`, info `lets-todo/session/v1`). The transcript is the canonical JSON object `{ version, offerId, server, client, serverPublicKey, clientPublicKey }` in that exact key order. Android must verify `pair.challenge.proof = HMAC-SHA256(key, "server:" + transcript)` and independently display `uint32be(HMAC-SHA256(key, "verify:" + transcript)[0..3]) mod 1000000` as six digits. The desktop does not mark the device paired until the user confirms that both independently calculated codes match. `pair.accepted` is the first AES-256-GCM protected frame.

## Reconnection

Android sends `session.hello` with its paired `deviceId` and a random 32-byte `clientNonce`. It answers `session.challenge` with `session.authenticate`, echoing both nonces and sending `proof = HMAC-SHA256(sessionKey, "session:<deviceId>:<clientNonce>:<serverNonce>")` as base64url. The session key uses the persisted X25519 keys and HKDF-SHA256 with `salt = SHA256(clientNonce || serverNonce)` and info `lets-todo/session/v1`.

## Secure frames and sync

Protected frames are `{ "type":"secure", "iv", "data", "tag" }`, using AES-256-GCM with a random 12-byte IV and a 16-byte tag. Repeated IVs are rejected per connection.

Inside the secure channel:

- `sync.pull` returns `sync.result` with a complete snapshot.
- `sync.push` carries `snapshot` and returns the merged snapshot.
- Collections are tasks, habits, events, timers, habit history and timer sessions.
- Every entity has a Lamport-style `{ counter, deviceId }` revision, `modifiedAt`, payload and optional tombstone (`deleted: true`). Conflicts resolve deterministically by counter, then timestamp, then device id. Returned snapshots advance the receiver clock before later offline edits.
