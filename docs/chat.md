# Chat: how it works and what it costs

Wayamesh chat costs nothing to run. There is no chat server, database or paid service of ours.

- **Transport:** free public Nostr relays (`nos.lol`, `relay.primal.net`, `relay.damus.io`), with failover. A message is published to every relay that is up.
- **Privacy:** each message is sealed end to end to the recipient's chat key and published under a throwaway key. Relays see ciphertext only.
- **Self-deleting:** every message carries an expiry (24 hours after it was written), signed inside the sealed payload and also set as a NIP-40 `expiration` tag on the relay event. Receivers drop expired messages, and both the phone (SQLite) and the web wallet purge expired messages on start, on foreground, every 5 minutes while active, and when a thread opens. Expired messages are never republished.
- **Storage:** text only, at most 500 characters per message, at most 200 stored messages per thread and 1000 overall (oldest dropped first). Raw relay events are not kept after decryption; duplicates are ignored by message id.
- **What is never purged:** contacts, payments and their settlement status (they stay in History), and bookkeeping for messages carried for others. A payment bubble disappears with the chat, the payment does not.
- **Contacts:** save someone by name and wallet address (with an optional phone number note that is never used for lookup). You can pay them immediately. Chat starts once you exchange contact cards.
- **Bluetooth is optional.** Chat and payments work over the internet, or by QR code or text, with Bluetooth off or absent (Expo Go, iOS, web). Bluetooth chat on Android is experimental and untested on devices.

## Honest limits

- Delivery is not guaranteed. A message to someone offline is delivered when they come online, only if a relay still holds it; relays may drop it earlier, and after 24 hours it is gone everywhere that behaves.
- The phone subscribes only while the app is open; there are no background notifications.
- A relay or a recipient that ignores expiry could keep a copy; deletion is a promise of the protocol, not something we can enforce on others' devices.
- Public relays can be down or rate-limit; we have no control over their uptime.
