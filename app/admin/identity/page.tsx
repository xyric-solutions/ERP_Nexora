"use client";

import { useEffect } from "react";

export default function IdentityPage() {
  useEffect(() => {
    window.location.replace("/#/identity/access");
  }, []);

  return <main aria-live="polite">Opening Identity &amp; Access…</main>;
}
