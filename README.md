# Nostracar

→ https://leplatrem.github.io/nostracar/

Toy project to play with [NOSTR](https://nostr.com/) concepts.

The idea is to build a decentralized car sharing application Web app, potentially leveraging some of the protocol features.
It needs no backend, and use public relays by default.

> Note: The [AT Protocol](https://atproto.com/) could be a good candidate too.

## Current Features

- A driver publishes a trip offer (from, to, date, seats, price, notes)
- Riders search trips by from/to/date
- Riders and drivers can chat using encrypted direct messages (NIP-04)
- Drivers and riders authenticate either via browser extension (NIP-07) or a local key
- Show driver/rider reputation (age of profile, trips, history, existing reports)
- Drivers can delete their trips
- Multi-relay support

## Caveats

- Search using From/To must match exactly

## Potential Future Features

- Leverage identity hints to support human-readable handles everywhere, not only user profile page
- **Expire events**: Trips events should expire once date has passed
- **Updates**: Drivers should be able to update their trips
- **Reports**: Flag abusive users/events (NIP-56, `kind 1984`)
- **Payments**: Add invoices (NIP-57 zaps) for tipping/booking fees
- **Badges**: Show non-transferable profile badges (NIP-58) like "100+ rides", "on-time streak", "good driver".
- **Mute lists**: Respect user's mute/ban list, using standard list events (public or encrypted, NIP-51)

## Development

```
npm ci
```

```
npm run dev
```

## License

CC0 1.0 Universal
