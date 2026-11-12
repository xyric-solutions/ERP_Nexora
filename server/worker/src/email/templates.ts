/** Rendered email: plain text is always present; HTML is a simple escaped mirror of it. */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface CredentialEmailInput {
  displayName: string;
  organisationName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}

const productName = "Nexora";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Strips CR/LF so user-supplied values can never break a header line or the subject. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function assertHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("EMAIL_LOGIN_URL_INVALID");
  return url.toString();
}

function render(subject: string, paragraphs: readonly string[], details: readonly [string, string][]): RenderedEmail {
  const text = [
    ...paragraphs.slice(0, 2),
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    ...paragraphs.slice(2),
  ].join("\n");
  const html = [
    "<!doctype html>",
    '<html><body style="font-family: sans-serif; line-height: 1.5;">',
    ...paragraphs.slice(0, 2).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    "<table>",
    ...details.map(
      ([label, value]) =>
        `<tr><th align="left" style="padding-right: 12px;">${escapeHtml(label)}</th><td><code>${escapeHtml(value)}</code></td></tr>`,
    ),
    "</table>",
    ...paragraphs.slice(2).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    "</body></html>",
  ].join("\n");
  return { subject: singleLine(subject), text: `${text}\n`, html: `${html}\n` };
}

/** "Your Nexora account": sent when a Super Admin creates a user. */
export function renderAccountCreatedEmail(input: CredentialEmailInput): RenderedEmail {
  const loginUrl = assertHttpUrl(input.loginUrl);
  return render(
    `Your ${productName} account`,
    [
      `Hello ${singleLine(input.displayName)},`,
      `An account has been created for you in ${singleLine(input.organisationName)} on ${productName}.`,
      "You must change this temporary password the first time you sign in.",
      "If you did not expect this email, contact your administrator.",
    ],
    [
      ["Sign in at", loginUrl],
      ["Email", singleLine(input.email)],
      ["Temporary password", input.temporaryPassword],
    ],
  );
}

/** "Password reset": sent when a Super Admin resets a user's password. */
export function renderPasswordResetEmail(input: CredentialEmailInput): RenderedEmail {
  const loginUrl = assertHttpUrl(input.loginUrl);
  return render(
    `Your ${productName} password was reset`,
    [
      `Hello ${singleLine(input.displayName)},`,
      `An administrator of ${singleLine(input.organisationName)} reset your ${productName} password.`,
      "You must change this temporary password the next time you sign in. Your previous password no longer works.",
      "If you did not expect this email, contact your administrator.",
    ],
    [
      ["Sign in at", loginUrl],
      ["Email", singleLine(input.email)],
      ["Temporary password", input.temporaryPassword],
    ],
  );
}
