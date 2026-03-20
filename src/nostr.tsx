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
import * as nip04 from 'nostr-tools/nip04';

const KIND_NOSTR_NIP04 = 4;
const KIND_NOSTRACAR_TRIP = 30050;

const TIMEOUT_MS = 30000; // 30 seconds

export async function generateKey(): Promise<string> {
  const sk = generateSecretKey();
  return bytesToHex(sk);
}

export function asPublicKey(secretKey: string): string {
  const sk = hexToBytes(secretKey);
  return getPublicKey(sk);
}

async function sendEvent(
  relays: string[],
  secretKey: string,
  event: EventTemplate
) {
  if (relays.length === 0) {
    throw new Error('No valid relay URLs provided.');
  }

  const sk = hexToBytes(secretKey);
  const signedEvent = finalizeEvent(event, sk);

  console.log('Sending to relays:', relays);
  await Promise.allSettled(
    relays.map(async (url) => {
      const relay = await Relay.connect(url);
      await relay.publish(signedEvent);
      relay.close();
      return url;
    })
  );
}

async function fetchEvents(
  relays: string[],
  secretKey: string,
  filters: Array<Filter>
): Promise<NostrEvent[]> {
  if (relays.length === 0) {
    throw new Error('No valid relay URLs provided.');
  }

  // We'll collect events from all relays
  const allEvents: NostrEvent[] = [];

  // Map each relay connection to a promise
  const fetchPromises = relays.map(
    (url) =>
      new Promise<void>((resolve) => {
        Relay.connect(url)
          .then((relay) => {
            let timer: ReturnType<typeof setTimeout>;

            const sub = relay.subscribe(filters, {
              onevent(event) {
                allEvents.push(event);
              },
              oneose() {
                // EOSE = End of Stored Events. Relay is done sending history.
                clearTimeout(timer);
                sub.close();
                relay.close();
                resolve();
              },
            });

            // Safety timeout: if relay is slow, don't hang forever
            timer = setTimeout(() => {
              sub.close();
              relay.close();
              resolve();
            }, TIMEOUT_MS);
          })
          .catch((e) => {
            console.error(`Relay error for ${url}:`, e);
            resolve();
          });
      })
  );

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

  await Promise.all(
    relays.map(async (url) => {
      try {
        const relay = await Relay.connect(url);
        await relay.publish(signedEvent);
        relay.close();
      } catch (err) {
        console.error(`Failed to delete from ${url} (${err})`);
      }
    })
  );
}

export async function fetchTrips(
  relays: string[],
  secretKey: string
): Promise<NostrEvent[]> {
  return fetchEvents(relays, secretKey, [
    {
      kinds: [KIND_NOSTRACAR_TRIP],
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
  const events = await fetchEvents(relays, secretKey, [
    {
      kinds: [KIND_NOSTR_NIP04],
      '#g': ['nostracar-v0'],
      '#p': [pubkey],
      limit: 50,
    },
  ]);
  const decryptedMessages = await Promise.all(
    events.map(async (event) => ({
      ...event,
      content: await nip04.decrypt(secretKey, event.pubkey, event.content),
    }))
  );
  return decryptedMessages;
}

export async function postTrip(
  relays: string[],
  secretKey: string,
  content: string,
  tripData: Record<string, string>
) {
  const event = {
    kind: KIND_NOSTRACAR_TRIP,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [['g', 'nostracar-v0']].concat(
      Object.entries(tripData).map(([key, value]) => {
        return [key, value];
      })
    ),
  };
  return sendEvent(relays, secretKey, event);
}

export async function sendDM(
  relays: string[],
  secretKey: string,
  recipientPubKey: string,
  content: string,
  replyTo?: NostrEvent | null
) {
  const tags = [
    ['g', 'nostracar-v0'],
    ['p', recipientPubKey],
    ['d', 'dm-' + crypto.randomUUID()],
  ];
  if (replyTo) {
    tags.push(['e', replyTo.id]);
  }

  const event = {
    kind: KIND_NOSTR_NIP04,
    created_at: Math.floor(Date.now() / 1000),
    content: await nip04.encrypt(secretKey, recipientPubKey, content),
    tags,
  };
  return sendEvent(relays, secretKey, event);
}
