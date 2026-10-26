import type { HrLearningCertificate } from "@nexora/contracts";
function certificateHtml(c: HrLearningCertificate) {
  const escape = (v: unknown) =>
      String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;"),
    t = c.record.terms;
  if (t.kind !== "completion") throw Error("Certificate source unavailable");
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Internal training certificate</title><style>body{font-family:__GLOBAL_FONT__;max-width:48rem;margin:3rem auto;padding:1.5rem;line-height:1.6}dt{font-weight:600;margin-top:1rem}dd{margin-left:0}main{overflow-wrap:anywhere}@media print{body{margin:0}}</style></head><body><main><h1>Internal training certificate</h1><h2>' +
    escape(c.company_name) +
    "</h2><p>This records the verified internal learning completion of <strong>" +
    escape(t.employee_name) +
    "</strong> (" +
    escape(t.employee_number) +
    ").</p><h2>" +
    escape(t.programme_name) +
    "</h2><p>Session: " +
    escape(t.session_title) +
    "</p><dl><dt>Completed</dt><dd>" +
    escape(t.completed_on) +
    "</dd><dt>Attendance</dt><dd>" +
    escape(t.attendance_percent) +
    "%</dd><dt>Assessment</dt><dd>" +
    escape(t.assessment_score === null ? "Not required" : t.assessment_score + "%") +
    "</dd><dt>Certificate</dt><dd>" +
    escape(t.certificate_id) +
    "</dd><dt>Valid through</dt><dd>" +
    escape(t.valid_until ?? "No expiry") +
    "</dd><dt>Issued by</dt><dd>" +
    escape(c.issuer_name) +
    "</dd><dt>Issued at</dt><dd>" +
    escape(c.issued_at) +
    "</dd></dl><p>This is an internal company training record. Verify current validity in Nexora ERP; a downloaded copy does not reflect later revocation.</p></main></body></html>"
  );
}

/** Standalone internal certificate uses the same trusted global font as the screen. */
export function learningCertificateHtml(c: HrLearningCertificate, globalFont: string) {
  return certificateHtml(c).replace("__GLOBAL_FONT__", globalFont.replace(/[^a-zA-Z0-9 ,"'_-]/g, ""));
}
