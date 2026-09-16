// ============================================
// FILE: src/hooks/useSignedPhotoUrl.js
// Resolves a private "profile-photos" storage path into a temporary
// signed URL for display. Cached in-memory so repeated renders of the
// same avatar don't re-request a signed URL every time.
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

const SIGNED_URL_TTL_SECONDS = 3600;
const cache = new Map(); // path -> { url, expiresAt }

export const useSignedPhotoUrl = (path) => {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;

    if (!path) {
      setUrl(null);
      return undefined;
    }

    const cached = cache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return undefined;
    }

    supabase.storage.from('profile-photos').createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) {
          setUrl(null);
          return;
        }
        cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + (SIGNED_URL_TTL_SECONDS - 60) * 1000 });
        setUrl(data.signedUrl);
      });

    return () => { active = false; };
  }, [path]);

  return url;
};
