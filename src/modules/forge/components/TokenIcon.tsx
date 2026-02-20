"use client";

import { useEffect, useRef, useState } from "react";
import { generateIdenticonDataUrl } from "../utils/identicon";

interface Props {
  contractHash: string;
  size?: number;
}

/**
 * Token avatar: probes the NeoLine CDN via the Image() constructor, falls
 * back to a deterministic identicon if unavailable.
 *
 * Why Image() instead of <img onError>:
 *   Browsers negatively-cache failed image URLs.  An <img> with the same src
 *   as a previous failure fires onError immediately without a network request,
 *   so the 800 ms retry never actually reached the CDN.
 *
 * Strategy:
 *   1. Show identicon immediately (fast, no flash).
 *   2. Probe CDN after 400 ms (lets the <link rel="preconnect"> in layout warm up).
 *   3. If probe fails, retry with a cache-busting suffix after 2 000 ms.
 *   4. If retry also fails, permanently keep the identicon.
 *   5. On any success, switch from identicon → CDN icon in-place.
 *
 * CDN icons are shown on a white circle with ~12 % inset padding so
 * transparent PNGs (GAS, etc.) have breathing room.
 */
export function TokenIcon({ contractHash, size = 36 }: Props) {
  // null  → still probing / CDN unavailable  →  show identicon
  // string → CDN probed successfully         →  show CDN icon
  const [cdnSrc, setCdnSrc] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cdnBase = `https://cdn.neoline.io/logo/neo3/${contractHash.toLowerCase()}.png`;
  const pad = Math.max(2, Math.round(size * 0.12));

  useEffect(() => {
    let cancelled = false;

    function probe(delay: number, attempt: number) {
      timerRef.current = setTimeout(() => {
        if (cancelled) return;

        // Cache-bust retries so the browser doesn't re-use a negatively-cached URL
        const url = attempt === 0 ? cdnBase : `${cdnBase}?_=${attempt}`;

        const img = new Image();
        img.onload = () => {
          if (!cancelled) setCdnSrc(url); // url is browser-cached at this point
        };
        img.onerror = () => {
          if (cancelled) return;
          if (attempt < 2) {
            // Give more time for the TCP/TLS connection to warm up
            probe(2000, attempt + 1);
          }
          // attempt >= 2: all 3 probes failed — stay with identicon permanently
        };
        img.src = url;
      }, delay);
    }

    // Small initial delay so <link rel="preconnect"> can establish the connection
    probe(400, 0);

    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [cdnBase]);

  // CDN available — white circle with padding so transparent PNGs look right
  if (cdnSrc !== null) {
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
          src={cdnSrc}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }

  // Identicon — shown immediately and as permanent fallback if CDN unavailable
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
