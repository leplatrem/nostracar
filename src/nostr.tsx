import { Filter } from 'nostr-tools';

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  EventTemplate,
  NostrEvent,
} from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

const NOSTRACAR_POST_KIND = 30050;
const NOSTRACAR_DM_KIND = 30051;
const TIMEOUT_MS = 30000; // 30 seconds

export async function generateKey(): Promise<string> {
  const sk = generateSecretKey();
  return bytesToHex(sk);
}

export function asPublicKey(secretKey: string): string {
  const sk = hexToBytes(secretKey);
  return getPublicKey(sk);
}

async function sendNostrPost(
  relays: string[],
  secretKey: string,
  event: EventTemplate
) {
  const validRelays = relays.filter((url) => url.startsWith('wss://'));
  if (validRelays.length === 0) {
    throw new Error('No valid relay URLs provided.');
  }

  const sk = hexToBytes(secretKey);
  const signedEvent = finalizeEvent(event, sk);

  console.log('Sending to relays:', validRelays);
  const connections = await Promise.all(
    validRelays.map((url) => Relay.connect(url))
  );
  console.log(`Connected to ${connections.length} relays`);

  await Promise.allSettled(
    validRelays.map(async (url) => {
      const relay = await Relay.connect(url);
      await relay.publish(signedEvent);
      relay.close();
      return url;
    })
  );
  connections.forEach((relay) => relay.close());
}

async function fetchMessages(
  relays: string[],
  secretKey: string,
  filters: Array<Filter>
): Promise<NostrEvent[]> {
  const validRelays = relays.filter((url) => url.startsWith('wss://'));
  if (validRelays.length === 0) {
    throw new Error('No valid relay URLs provided.');
  }

  // We'll collect events from all relays
  const allEvents: NostrEvent[] = [];

  // Map each relay connection to a promise
  const fetchPromises = validRelays.map(async (url) => {
    return new Promise<void>(async (resolve) => {
      try {
        const relay = await Relay.connect(url);

        // Subscribe to the filter
        const sub = relay.subscribe(filters, {
          onevent(event) {
            allEvents.push(event);
          },
          oneose() {
            // EOSE = End of Stored Events. Relay is done sending history.
            sub.close();
            relay.close();
            resolve();
          },
        });

        // Safety timeout: if relay is slow, don't hang forever
        setTimeout(() => {
          sub.close();
          relay.close();
          resolve();
        }, TIMEOUT_MS);
      } catch (e) {
        console.error(`Relay error for ${url}:`, e);
        resolve();
      }
    });
  });

  await Promise.all(fetchPromises);

  return (
    allEvents
      // remove duplicates (since multiple relays might have the same post)
      .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)
      // Sort by newest first
      .sort((a, b) => b.created_at - a.created_at)
  );
}

export async function deleteEvent(
  relays: string[],
  secretKey: string,
  eventId: string,
  content: string
) {
  const sk = hexToBytes(secretKey);

  const eventTemplate = {
    kind: 5, // The standard Deletion Kind
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [
      ['e', eventId], // The ID of the original message/event to delete
    ],
  };

  const signedEvent = finalizeEvent(eventTemplate, sk);

  const validRelays = relays.filter((url) => url.startsWith('wss://'));
  await Promise.all(
    validRelays.map(async (url) => {
      try {
        const relay = await Relay.connect(url);
        await relay.publish(signedEvent);
        relay.close();
      } catch (e) {
        console.error(`Failed to delete from ${url}`);
      }
    })
  );
}

export async function fetchTrips(
  relays: string[],
  secretKey: string
): Promise<NostrEvent[]> {
  return fetchMessages(relays, secretKey, [
    {
      kinds: [NOSTRACAR_POST_KIND],
      '#g': ['nostracar-v0'],
      limit: 50,
    },
  ]);
}

export async function fetchInbox(
  relays: string[],
  secretKey: string
): Promise<NostrEvent[]> {
  const pubkey = asPublicKey(secretKey);
  return fetchMessages(relays, secretKey, [
    {
      kinds: [NOSTRACAR_DM_KIND],
      '#g': ['nostracar-v0'],
      '#p': [pubkey],
      limit: 50,
    },
  ]);
}

export async function postTrip(
  relays: string[],
  secretKey: string,
  content: string,
  tripData: Record<string, string>
) {
  const event = {
    kind: NOSTRACAR_POST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [['g', 'nostracar-v0']].concat(
      Object.entries(tripData).map(([key, value]) => {
        return [key, value];
      })
    ),
  };
  return await sendNostrPost(relays, secretKey, event);
}

export async function sendDM(
  relays: string[],
  secretKey: string,
  recipientPubKey: string,
  content: string
) {
  const event = {
    kind: NOSTRACAR_DM_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [
      ['g', 'nostracar-v0'],
      ['p', recipientPubKey],
      ['d', 'dm-' + crypto.randomUUID()],
    ],
  };
  return await sendNostrPost(relays, secretKey, event);
}
