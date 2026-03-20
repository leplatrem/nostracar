import { useEffect, useMemo, useState } from 'react';
import { makeKeySigner, makeNip07Signer, NostrSigner } from '../nostr';
import { useSettings } from './settings';

export function useIdentity(): {
  signer: NostrSigner | null;
  pubkey: string;
  hasNip07: boolean;
} {
  const { privateKey } = useSettings();
  const hasNip07 =
    typeof window !== 'undefined' && 'nostr' in window && !!window.nostr;

  const signer = useMemo<NostrSigner | null>(() => {
    if (hasNip07) return makeNip07Signer();
    if (privateKey) return makeKeySigner(privateKey);
    return null;
  }, [hasNip07, privateKey]);

  const [pubkey, setPubkey] = useState('');

  useEffect(() => {
    if (!signer) {
      setPubkey('');
      return;
    }
    signer.getPublicKey().then(setPubkey).catch(() => setPubkey(''));
  }, [signer]);

  return { signer, pubkey, hasNip07 };
}
