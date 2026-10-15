"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="nx-system-state" role="alert">
      <h1>Workspace unavailable</h1>
      <p>The page could not be loaded.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
