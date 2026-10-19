import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";

export function SuperAdminOverrideWarning({ className = "" }: { className?: string }) {
  return (
    <Alert
      className={`border-[var(--nx-warning-border)] border-l-4 bg-[var(--nx-warning-soft)] text-foreground ${className}`}
    >
      <AlertTitle className="text-[var(--nx-warning)]">Super-admin override</AlertTitle>
      <AlertDescription className="text-foreground/80">
        You created or submitted this record. Continuing overrides independent maker/checker separation. Enter a
        business reason; the decision and override will be permanently audited.
      </AlertDescription>
    </Alert>
  );
}
