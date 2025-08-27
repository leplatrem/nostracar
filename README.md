# Nostracar

Toy project to play with [NOSTR](https://nostr.com/) concepts.

The idea is to build a decentralized car sharing application Web app, potentially leveraging the following features of the protocol:

- **Custom events**: A driver publishes a ride offer (from, to, date, seats, price, notes), using custom event kind (eg. `kind 30001`).
- **Search**: Riders search by from/to/date across multiple relays
- **Direct Messages**: Contact the driver via Nostr DM (NIP-04)
- **Payments**: Add invoices (NIP-57 zaps) for tipping/booking fees
- **Identity**: Identify clients leveraging a NIP-07 extension (e.g. [Iris](https://nostr.how/en/guides/iris)) or a local ephemeral key.
- **Identity hints**: Use NIP-05 (DNS mapping) to support human-readable handle (e.g. alice@example.com).
- **Multi-relay**: Leverage pool from [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) to support multi-relay pub/sub.
- **Reputation**: Show driver/rider age of key. Query earliest seen event by that pubkey as a proxy for account age (`kind 0` metadata or any event). Display "on Nostracar since <date>".
- **History**: Query relays for ride events kind (e.g. `kind=30001` and `author=pubkey`) to count results and show first/last ride timestamps.
- **Reports**: Flag abusive users/events (NIP-56, `kind 1984`). Surface "this driver was reported" and let users add reports.
- **Badges**: Show non-transferable profile badges (NIP-58) like "100+ rides", "on-time streak", "good driver".
- **Mute lists**: Respect user's mute/ban list, using standard list events (public or encrypted, NIP-51).


## Development

```
npm ci
```

```
npm run dev
```

## License

CC0 1.0 Universal
