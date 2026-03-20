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

// ─── NIP-07 window.nostr type ─────────────────────────────────────────────────

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: EventTemplate): Promise<NostrEvent>;
      nip04: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

// ─── Signer abstraction ───────────────────────────────────────────────────────

export interface NostrSigner {
  getPublicKey(): Promise<string>;
  signEvent(template: EventTemplate): Promise<NostrEvent>;
  nip04: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

export function makeKeySigner(secretKey: string): NostrSigner {
  const sk = hexToBytes(secretKey);
  return {
    getPublicKey: async () => getPublicKey(sk),
    signEvent: async (template) => finalizeEvent(template, sk),
    nip04: {
      encrypt: (pubkey, plaintext) => nip04.encrypt(secretKey, pubkey, plaintext),
      decrypt: (pubkey, ciphertext) => nip04.decrypt(secretKey, pubkey, ciphertext),
    },
  };
}

export function makeNip07Signer(): NostrSigner {
  return {
    getPublicKey: () => window.nostr!.getPublicKey(),
    signEvent: (template) => window.nostr!.signEvent(template),
    nip04: {
      encrypt: (pubkey, plaintext) => window.nostr!.nip04.encrypt(pubkey, plaintext),
      decrypt: (pubkey, ciphertext) => window.nostr!.nip04.decrypt(pubkey, ciphertext),
    },
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const KIND_NOSTR_NIP04 = 4;
const KIND_NOSTRACAR_TRIP = 30050;
const TIMEOUT_MS = 30000; // 30 seconds

export async function generateKey(): Promise<string> {
  return bytesToHex(generateSecretKey());
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function sendEvent(
  relays: string[],
  signer: NostrSigner,
  event: EventTemplate
) {
  if (relays.length === 0) {
    throw new Error('No valid relay URLs provided.');
  }

  const signedEvent = await signer.signEvent(event);

  await Promise.allSettled(
    relays.map(async (url) => {
      const relay = await Relay.connect(url);
      await relay.publish(signedEvent);
      relay.close();
    })
  );
}

async function fetchEvents(
  relays: string[],
  filters: Array<Filter>
): Promise<NostrEvent[]> {
  if (relays.length === 0) {
    throw new Error('No valid relay URLs provided.');
  }

  const allEvents: NostrEvent[] = [];

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
                clearTimeout(timer);
                sub.close();
                relay.close();
                resolve();
              },
            });

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

  return allEvents
    .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)
    .sort((a, b) => b.created_at - a.created_at);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchTrips(relays: string[]): Promise<NostrEvent[]> {
  return fetchEvents(relays, [
    {
      kinds: [KIND_NOSTRACAR_TRIP],
      '#g': ['nostracar-v0'],
      limit: 50,
    },
  ]);
}

export async function fetchInbox(
  relays: string[],
  signer: NostrSigner
): Promise<NostrEvent[]> {
  const pubkey = await signer.getPublicKey();
  const events = await fetchEvents(relays, [
    {
      kinds: [KIND_NOSTR_NIP04],
      '#g': ['nostracar-v0'],
      '#p': [pubkey],
      limit: 50,
    },
  ]);
  return Promise.all(
    events.map(async (event) => ({
      ...event,
      content: await signer.nip04.decrypt(event.pubkey, event.content),
    }))
  );
}

export async function deleteEvent(
  relays: string[],
  signer: NostrSigner,
  eventId: string,
  content: string
) {
  const template = {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [['e', eventId]],
  };
  const signedEvent = await signer.signEvent(template);
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

export async function postTrip(
  relays: string[],
  signer: NostrSigner,
  content: string,
  tripData: Record<string, string>
) {
  const event = {
    kind: KIND_NOSTRACAR_TRIP,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [['g', 'nostracar-v0']].concat(
      Object.entries(tripData).map(([key, value]) => [key, value])
    ),
  };
  return sendEvent(relays, signer, event);
}

export async function sendDM(
  relays: string[],
  signer: NostrSigner,
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
    content: await signer.nip04.encrypt(recipientPubKey, content),
    tags,
  };
  return sendEvent(relays, signer, event);
}
