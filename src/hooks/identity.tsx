import { useEffect, useState } from 'react';
import {
  fetchProfile,
  fetchReports,
  fetchUserTrips,
  makeKeySigner,
  makeNip07Signer,
  NostrProfile,
  NostrSigner,
  Trip,
  validateNIP05,
} from '../nostr';
import { useSettings } from './settings';
import { NostrEvent } from 'nostr-tools';

export function useIdentity(): {
  signer: NostrSigner | null;
  pubkey: string;
  hasNip07: boolean;
} {
  const { privateKey } = useSettings();
  const hasNip07 =
    typeof window !== 'undefined' && 'nostr' in window && !!window.nostr;

  const [signer, setSigner] = useState<NostrSigner | null>(null);
  const [pubkey, setPubkey] = useState('');

  useEffect(() => {
    let cancelled = false;
    let activeSigner: NostrSigner | null = null;

    const init = async () => {
      if (hasNip07) {
        const s = makeNip07Signer();
        activeSigner = s;
        if (!cancelled) setSigner(s);
        const pk = await s.getPublicKey().catch(() => '');
        if (!cancelled) setPubkey(pk);
        return;
      }

      if (privateKey) {
        const s = makeKeySigner(privateKey);
        activeSigner = s;
        if (!cancelled) setSigner(s);
        const pk = await s.getPublicKey().catch(() => '');
        if (!cancelled) setPubkey(pk);
        return;
      }

      if (!cancelled) {
        setSigner(null);
        setPubkey('');
      }
    };

    init();

    return () => {
      cancelled = true;
      activeSigner?.close?.();
    };
  }, [hasNip07, privateKey]);

  return { signer, pubkey, hasNip07 };
}

export function useReports(relays: string[], viewPubkey: string | undefined) {
  const [reports, setReports] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewPubkey) return;
    let cancelled = false;
    setLoading(true);

    fetchReports(relays, viewPubkey)
      .then((reportEvents) => {
        if (!cancelled) setReports(reportEvents);
      })
      .catch(() => {
        if (!cancelled) setReports([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewPubkey, relays]);

  return { reports, loading };
}
export function useProfile(relays: string[], viewPubkey: string | undefined) {
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [metadataAt, setMetadataAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewPubkey) return;
    let cancelled = false;
    setLoading(true);

    fetchProfile(relays, viewPubkey)
      .then((data) => {
        if (!cancelled) {
          setProfile(data.profile);
          setMetadataAt(data.metadataAt);
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewPubkey, relays]);

  return { profile, metadataAt, loading };
}

export function useUserTrips(relays: string[], viewPubkey: string | undefined) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewPubkey) return;
    let cancelled = false;
    setLoading(true);

    fetchUserTrips(relays, viewPubkey)
      .then((tripEvents) => {
        if (!cancelled) setTrips(tripEvents);
      })
      .catch(() => {
        if (!cancelled) setTrips([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewPubkey, relays]);

  return { trips, loading };
}

export function useNip05Validation(
  nip05: string | undefined,
  viewPubkey: string | undefined
) {
  const [valid, setValid] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nip05 || !viewPubkey) return;
    let cancelled = false;
    setLoading(true);

    validateNIP05(nip05, viewPubkey)
      .then((isValid) => {
        if (!cancelled) setValid(isValid);
      })
      .catch(() => {
        if (!cancelled) setValid(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nip05, viewPubkey]);

  return { valid, loading };
}
