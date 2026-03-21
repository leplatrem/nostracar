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
const FETCH_WELLKNOWN_TIMEOUT_MS = 5000;
const FETCH_LIMIT = 50;

export interface NostrProfile {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  banner?: string;
}

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

// ─── Signers ───────────────────────────────────────────────────────

export interface NostrSigner {
  getPublicKey(): Promise<string>;
  signEvent(template: EventTemplate): Promise<NostrEvent>;
  nip04: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  /** Clean up any open connections (e.g. NIP-46 relay subscriptions) */
  close?(): Promise<void>;
}

export function makeKeySigner(secretKey: string): NostrSigner {
  const sk = hexToBytes(secretKey);
  return {
    getPublicKey: async () => getPublicKey(sk),
    signEvent: async (template) => finalizeEvent(template, sk),
    nip04: {
      encrypt: async (pubkey, plaintext) =>
        nip04.encrypt(secretKey, pubkey, plaintext),
      decrypt: async (pubkey, ciphertext) =>
        nip04.decrypt(secretKey, pubkey, ciphertext),
    },
  };
}

export function makeNip07Signer(): NostrSigner {
  return {
    getPublicKey: () => window.nostr!.getPublicKey(),
    signEvent: (template) => window.nostr!.signEvent(template),
    nip04: {
      encrypt: (pubkey, plaintext) =>
        window.nostr!.nip04.encrypt(pubkey, plaintext),
      decrypt: (pubkey, ciphertext) =>
        window.nostr!.nip04.decrypt(pubkey, ciphertext),
    },
  };
}

export async function generateKey(): Promise<string> {
  return bytesToHex(generateSecretKey());
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

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

export async function fetchProfile(
  relays: string[],
  pubkey: string
): Promise<{ profile: NostrProfile | null; metadataAt: number | null }> {
  const events = await fetchEvents(relays, [
    { kinds: [0], authors: [pubkey], limit: 1 },
  ]);
  if (events.length === 0) return { profile: null, metadataAt: null };
  const event = events[0];
  try {
    const raw = JSON.parse(event.content) as Record<string, string>;
    return {
      profile: {
        name: raw.name,
        displayName: raw.display_name,
        about: raw.about,
        picture: raw.picture,
        nip05: raw.nip05,
        banner: raw.banner,
      },
      metadataAt: event.created_at,
    };
  } catch (e) {
    console.error(e);
    return { profile: null, metadataAt: event.created_at };
  }
}

export async function fetchReports(
  relays: string[],
  pubkey: string
): Promise<NostrEvent[]> {
  return fetchEvents(relays, [{ kinds: [1984], '#p': [pubkey] }]);
}

export async function validateNIP05(
  nip05: string,
  pubkey: string
): Promise<boolean> {
  const [name, domain] = nip05.split('@');
  if (!name || !domain) return false;
  try {
    const response = await fetch(
      `https://${domain}/.well-known/nostr.json?name=${name}`,
      {
        signal: AbortSignal.timeout(FETCH_WELLKNOWN_TIMEOUT_MS),
      }
    );
    const data = await response.json();
    return data?.names?.[name] === pubkey;
  } catch {
    return false;
  }
}

// ─── High-level NostraCar API ───────────────────────────────────────────────────────────────

export type Trip = {
  rawId: string;
  id: string;
  info: string;
  createdAt: Date;
  driver: string;
  from: string;
  to: string;
  date: string;
  time: string;
  seats: number;
  price: number;
  currency: string;
};

function eventToTrip(event: NostrEvent): Trip {
  const eventTags = event.tags.reduce(
    (acc, [key, value]) => {
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );

  return {
    rawId: event.id,
    id: eventTags.d || '',
    driver: event.pubkey,
    info: event.content,
    createdAt: new Date(event.created_at * 1000),
    from: eventTags.from || '',
    to: eventTags.to || '',
    date: eventTags.date || '',
    time: eventTags.time || '',
    seats: parseInt(eventTags.seats || '0', 10),
    price: parseFloat(eventTags.price || '0'),
    currency: eventTags.currency || 'SATS',
  };
}

export async function fetchTrips(
  relays: string[],
  filters: { from?: string; to?: string; date?: string } = {}
): Promise<Trip[]> {
  const events = await fetchEvents(relays, [
    {
      kinds: [KIND_NOSTRACAR_TRIP],
      '#g': ['nostracar-v0'],
      limit: FETCH_LIMIT,
    },
  ]);
  const allResults = events
    .map(eventToTrip)
    .filter((e) => e.from && e.to && e.date);
  return allResults.filter((t) => {
    const matchFrom =
      !filters.from ||
      t.from.toLowerCase().includes(filters.from.toLowerCase());
    const matchTo =
      !filters.to || t.to.toLowerCase().includes(filters.to.toLowerCase());
    const matchDate = !filters.date || t.date === filters.date;
    return matchFrom && matchTo && matchDate;
  });
}

export async function fetchInbox(
  relays: string[],
  signer: NostrSigner
): Promise<NostrEvent[]> {
  const pubkey = await signer.getPublicKey();
  const events = await fetchEvents(relays, [
    {
      kinds: [KIND_NOSTR_NIP04],
      // Only show messages of our app.
      '#g': ['nostracar-v0'],
      '#p': [pubkey],
      limit: FETCH_LIMIT,
    },
  ]);
  return Promise.all(
    events.map(async (event) => ({
      ...event,
      content: await signer.nip04.decrypt(event.pubkey, event.content),
    }))
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

export async function fetchUserTrips(
  relays: string[],
  pubkey: string
): Promise<Trip[]> {
  const events = await fetchEvents(relays, [
    { kinds: [KIND_NOSTRACAR_TRIP], authors: [pubkey], '#g': ['nostracar-v0'] },
  ]);
  return events.map(eventToTrip).filter((t) => t.from && t.to);
}
