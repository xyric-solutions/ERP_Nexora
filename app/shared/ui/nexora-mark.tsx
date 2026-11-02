/** Compact folded N; shared by the workspace and sign-in branding. */
export function NexoraMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" focusable="false">
      <path d="M4 9 10 5v20l-6 4V9Z" fill="currentColor" opacity=".75" />
      <path d="m10 5 12 18v6L10 11V5Z" fill="currentColor" />
      <path d="m22 7 6-4v20l-6 6V7Z" fill="currentColor" opacity=".9" />
    </svg>
  );
}
