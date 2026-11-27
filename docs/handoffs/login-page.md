# Nexora login page handoff

Repository: `xyric-solutions/ERP_Nexora`

Sharing branch: `share/nexora-login-page`

Source snapshot: `8acaee1`

This branch shares the existing Nexora login implementation and its dependencies.
The login code is unchanged from the source snapshot. The handoff adds this guide;
it does not create a second login implementation or enable organisation signup.
Like any normal Git branch, this branch contains the repository snapshot, not
only the login files. The file map below identifies the login-specific code and
the shared pieces needed when integrating it into another application.

## Get the branch

Your GitHub account needs read access to this repository. A branch name or commit
hash identifies source code; it does not grant repository access.

For a new checkout:

```sh
git clone --single-branch --branch share/nexora-login-page https://github.com/xyric-solutions/ERP_Nexora.git
cd ERP_Nexora
```

If the repository is already cloned, run these commands from its root instead:

```sh
git fetch origin
git switch --track origin/share/nexora-login-page
```

Use Node.js 24 and npm 11, as specified in the root `package.json`. Install the
locked dependency versions and start the web application:

```sh
npm ci
npm run dev:web
```

Open `http://localhost:3000/login`. The web development command also builds the
shared contracts package before starting Next.js. Viewing the login form does
not create an account; successful sign-in requires a compatible running API and
an existing provisioned user. No database or API service is started by this web
command.

## Login source and UI dependencies

| Purpose | Files |
| --- | --- |
| Login form and sign-in steps | `app/login/page.tsx` |
| Split layout, headings, field styling and error message | `app/login/auth-layout.tsx` |
| Shared UI controls | `app/components/ui/button.tsx`, `app/components/ui/input.tsx`, `app/components/ui/label.tsx`, `app/components/ui/skeleton.tsx` |
| Inline SVG brand mark and application name | `app/shared/ui/nexora-mark.tsx`, `app/shared/constants/application.ts` |
| Tailwind entry and semantic colour mappings | `app/globals.css`, `postcss.config.mjs` |
| Reset, colours, typography and geometry | `app/shared/styles/globals.css`, `app/shared/styles/theme-colors.css`, `app/shared/styles/typography.css`, `app/shared/styles/tokens.css`, `app/shared/styles/theme-controls.css` |
| Light/dark theme setup | `app/shared/theme/config.ts`, `app/shared/theme/provider.tsx` |
| Existing root wiring, for reference | `app/layout.tsx` |

The logo is inline SVG; there is no external logo image to download. Preserve the
shared semantic tokens and CSS import order when moving the UI. The existing
root layout also imports ERP feature styles: use it as a wiring reference rather
than copying those unrelated feature imports into another application.

The controls use `@base-ui/react`, `cn`, `class-variance-authority` and
`lucide-react`, alongside React, Next.js and Tailwind. Use the checked-in
`package.json` and `package-lock.json` for compatible versions. This page uses
Next.js navigation and links, so it is not a plain HTML file.

## Authentication integration

| Purpose | Files |
| --- | --- |
| Session provider and login actions | `app/lib/session/session-provider.tsx` |
| Selected-company context | `app/lib/session/active-company.ts` |
| Cookie-session and CSRF handling | `app/lib/auth/session-client.ts` |
| Existing generated HTTP client | `app/lib/api/generated.ts` |
| Browser API base URL | `app/shared/config/runtime.ts` |
| Shared request/response contracts | `packages/contracts/` |
| Next.js API proxy configuration | `next.config.ts` |

The current login covers username/email and password, password visibility,
organisation selection, mandatory initial password change, company selection,
session restore and redirect after selecting a company. The session provider
must wrap the page, as shown in `app/layout.tsx`.

When integrating into a different application, either retain these existing
session/client/contracts dependencies or connect the page's `useSession` actions
to that application's real authentication service. Also adapt the successful
sign-in destination (`/`) and the registration link (`/register`) to its routes.
The current organisation registration page is a prototype, not a working signup
API.

The default local API origin is `http://localhost:4000`. Configure
`NEXT_PUBLIC_API_BASE_URL` for the recipient's API origin if different. When
using a same-origin reverse proxy, set it to the web origin and configure
`NEXORA_API_PROXY_ORIGIN` for the existing Next.js rewrite. The API must allow the
web origin and support the existing cookie and CSRF requirements.

The existing authentication routes are:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | Verify credentials |
| POST | `/api/v1/auth/select-tenant` | Complete organisation selection |
| POST | `/api/v1/auth/cancel-tenant-selection` | Cancel organisation selection |
| POST | `/api/v1/auth/change-initial-password` | Complete initial password change |
| GET | `/api/v1/auth/session` | Restore the cookie session |
| GET | `/api/v1/auth/companies` | List authorized companies |
| POST | `/api/v1/auth/session/company` | Select the active company |
| POST | `/api/v1/auth/logout` | End the session |

Keep authentication on the server. Preserve HttpOnly session cookies and the
existing CSRF handling rather than storing passwords or session tokens in browser
storage. Supply the recipient's environment configuration locally; no production
credentials, local `.env` files or business records are part of this handoff.

## Return changes for review

Create a working branch from this sharing branch, then commit only the intended
login integration changes:

```sh
git switch -c colleague/login-integration
git add -- <explicit-login-files-you-changed>
git commit -m "Integrate Nexora login page"
git push -u origin colleague/login-integration
```

Replace the angle-bracket argument with actual file paths. Open a pull request
against `share/nexora-login-page` for review. This workflow does not push or merge
changes to `main`.
