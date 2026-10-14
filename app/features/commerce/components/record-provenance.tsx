"use client";

import { Button } from "@/components/ui/button";

/**
 * Record provenance strip.
 *
 * Reviewers of an accounting system look for the same thing on every record:
 * who created it, who touched it last, which document it came from, and
 * whether the trail is complete. Putting that on the record itself - rather
 * than behind an "Audit trail" tab - is what makes a screen read as
 * accountable software.
 *
 * Values are deterministic prototype fixtures derived from the record itself.
 */

export interface RecordProvenanceProps {
  document: string;
  owner: string;
  date: string;
  reference: string;
  status: string;
  onAction?: (action: string, target: string) => void;
}

/** Stable pseudo-times so the strip does not churn between renders. */
function stamp(seed: string, offsetHours: number): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 1440;
  const base = (hash + offsetHours * 60) % 1440;
  const hh = String(Math.floor(base / 60)).padStart(2, "0");
  const mm = String(base % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function RecordProvenance({ document, owner, date, reference, status, onAction }: RecordProvenanceProps) {
  const sealed = /posted|paid|approved|complete|closed|reconciled/i.test(status);
  return (
    <section className="nx-provenance" aria-label={`Provenance for ${document}`}>
      <dl className="nx-provenance__facts">
        <div>
          <dt>Created</dt>
          <dd>{owner}<small>{date} &middot; {stamp(document, 0)}</small></dd>
        </div>
        <div>
          <dt>Last modified</dt>
          <dd>{owner}<small>{date} &middot; {stamp(document, 7)}</small></dd>
        </div>
        <div>
          <dt>Source document</dt>
          <dd>{reference}<small>Linked upstream record</small></dd>
        </div>
        <div>
          <dt>Numbering</dt>
          <dd>{document}<small>Governed sequence &middot; specimen</small></dd>
        </div>
        <div>
          <dt>Trail</dt>
          <dd>
            <span className={sealed ? "nx-provenance__seal is-sealed" : "nx-provenance__seal"}>
              {sealed ? "Sealed" : "Open for edit"}
            </span>
            <small>{sealed ? "Changes require a reversal" : "Field history retained"}</small>
          </dd>
        </div>
      </dl>
      <Button variant="ghost" type="button" className="nx-provenance__link" onClick={() => onAction?.("View audit trail", document)}>
        Full audit trail
      </Button>
    </section>
  );
}
