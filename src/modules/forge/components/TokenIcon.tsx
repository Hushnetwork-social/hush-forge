"use client";

import { useEffect, useRef, useState } from "react";
import { generateIdenticonDataUrl } from "../utils/identicon";

interface Props {
  contractHash: string;
  size?: number;
  /** Optional user-supplied icon URL. Probed first; falls through to CDN then identicon. */
  imageUrl?: string;
}

/**
 * Token avatar with three-tier fallback:
 *   1. imageUrl (user-supplied, probed first — 200ms delay, 1 retry)
 *   2. NeoLine CDN (400ms delay, 2 retries)
 *   3. Deterministic identicon (always shown immediately as placeholder)
 *
 * Why Image() instead of <img onError>:
 *   Browsers negatively-cache failed image URLs.  An <img> with the same src
 *   as a previous failure fires onError immediately without a network request,
 *   so retries never actually reach the server.
 *
 * CDN and custom icons: white circle bg with ~12% inset padding.
 * Identicons: plain rounded-full (have own dark bg).
 */
export function TokenIcon({ contractHash, size = 36, imageUrl }: Props) {
  // null  → still probing / all sources failed → show identicon
  // string → a source succeeded               → show that URL
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cdnBase = `https://cdn.neoline.io/logo/neo3/${contractHash.toLowerCase()}.png`;
  const pad = Math.max(2, Math.round(size * 0.12));

  useEffect(() => {
    let cancelled = false;
    setDisplaySrc(null);

    function probeCdn(initialDelay: number) {
      function attempt(delay: number, retry: number) {
        timerRef.current = setTimeout(() => {
          if (cancelled) return;
          const url = retry === 0 ? cdnBase : `${cdnBase}?_=${retry}`;
          const img = new Image();
          img.onload = () => { if (!cancelled) setDisplaySrc(url); };
          img.onerror = () => { if (!cancelled && retry < 2) attempt(2000, retry + 1); };
          img.src = url;
        }, delay);
      }
      attempt(initialDelay, 0);
    }

    if (imageUrl) {
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        const img = new Image();
        img.onload = () => { if (!cancelled) setDisplaySrc(imageUrl); };
        img.onerror = () => {
          if (cancelled) return;
          // Retry imageUrl once with cache-buster before falling through to CDN
          const retry = new Image();
          retry.onload = () => { if (!cancelled) setDisplaySrc(`${imageUrl}?_=1`); };
          retry.onerror = () => { if (!cancelled) probeCdn(0); };
          retry.src = `${imageUrl}?_=1`;
        };
        img.src = imageUrl;
      }, 200);
    } else {
      probeCdn(400);
    }

    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [imageUrl, cdnBase]);

  // A source succeeded — white circle with padding so transparent PNGs look right
  if (displaySrc !== null) {
    return (
      <div
        aria-hidden="true"
        className="rounded-full flex-shrink-0"
        style={{
          width: size,
          height: size,
          background: "white",
          padding: pad,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={displaySrc}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }

  // Identicon — shown immediately and as permanent fallback if all sources fail
  return (
    <img
      aria-hidden="true"
      src={generateIdenticonDataUrl(contractHash, size)}
      alt=""
      className="rounded-full flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
