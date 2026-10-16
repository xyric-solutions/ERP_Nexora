"use client";

import { useEffect } from "react";

export default function IdentityPage() {
  useEffect(() => {
    window.location.replace(`/#/identity/access${window.location.search}`);
  }, []);

  return <main aria-live="polite">Opening Identity &amp; Access…</main>;
}
