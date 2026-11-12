"use client";

import { useEffect } from "react";

/** Old Identity & Access link: user and access management now lives in Administration → Users. */
export default function IdentityPage() {
  useEffect(() => {
    window.location.replace("/#/administration/users");
  }, []);

  return <main aria-live="polite">Opening Administration…</main>;
}
