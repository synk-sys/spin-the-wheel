# DevFest Toronto 2026: Spin the Wheel 🎡

A fair, live raffle app for the DevFest Toronto 2026 closing ceremony (~300 attendees). Organizers import attendees from CSV, set up prize rounds, and run the draw from a laptop while a projector shows an animated wheel and winner reveal.

This app is standalone. It shares no code, data, or infrastructure with AI DNA, the Community Photo Wall, or other DevFest apps.

- **Organizer dashboard** (`/admin`): sign in with Google, import attendees, manage participants and prizes, run the raffle, export results.
- **Projector display** (`/display`): fullscreen 1920×1080 wheel and winner reveal. Read-only, shows no private data.
- **Demo mode**: 300 fictional attendees and sample prizes, fully isolated from production, for practicing.

More docs:

- [Event-day operations guide](docs/EVENT_DAY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

---

## How fairness works

The wheel doesn't pick the winner. The server does, before the wheel moves.

1. An organizer clicks **Start spin**. The browser sends the prize ID and a fresh idempotency key.
2. The server takes the **draw lock** for that environment, so only one draw or import runs at a time.
3. It reads the **complete eligible pool**: every participant whose status is `eligible`. Earlier winners, voided winners, ineligible and removed participants are excluded. Each eligible person appears exactly once. Selection is never weighted by name, import order, ticket number, or anything else.
4. It sorts the pool by internal ID (so query order can't matter) and picks an index with **`crypto.randomInt`**, Node's cryptographically secure, uniform RNG. `Math.random()` is never used for selection, and a test enforces that.
5. It commits in a **Firestore transaction** that re-checks:
   - it still holds the lock,
   - the pool's `eligibilityVersion` hasn't changed since the snapshot (every eligibility change bumps it),
   - the winner is still eligible,
   - the prize still has quantity left,
   - the raffle isn't paused.

   If anything changed, nothing is written and the server re-reads the pool and re-selects (up to 3 times).
6. The commit records the winner, eligible pool size, organizer, timestamp, prize, and idempotency key. It also decrements the prize quantity, marks the participant as a winner, and writes an audit event, all atomically.
7. The projector then animates the wheel to a decorative segment derived from the draw ID and reveals the winner. The segments don't represent participants, and the projector says so on screen.

A retried request with the same idempotency key (for example after a network drop) returns the original result instead of drawing again. If a draw fails, no prize is consumed and nobody is marked as a winner.

**About the statistical tests.** The test suite includes chi-square simulations: 300,000 selections across 300 participants, and 3,000 complete raffles through the full draw path. They check for obvious bias. Passing them supports confidence but **does not mathematically prove fairness**. Fairness rests on `crypto.randomInt` being uniform and on each eligible participant appearing exactly once in the pool. Both are enforced in code and covered by tests.

---

## Architecture

```
src/
  app/
    admin/            Organizer pages (server-gated: session + allowlist checked per request)
    display/          Public projector page
    login/            Google sign-in (plus local dev sign-in)
    api/
      admin/*         Privileged JSON APIs (organizerRoute wrapper: CSRF, auth, env, validation)
      auth/*          Session cookie create/revoke, dev login, whoami
      display         Public, projector-safe state (polling fallback)
  lib/
    raffle/service.ts The core rules: draws, locks, imports, status transitions, audit
    store/            DocStore interface with Firestore and in-memory implementations
    csv/              CSV parse/map/validate/dedupe (shared by browser + server); safe export
    auth/             Session cookies, organizer policy, dev sessions
    display/          Projector phase state machine + sync hook
    wheel/geometry.ts Shared wheel math and spin curve
  components/         Admin UI, wheel, projector screen, confetti, synthesized sound
tests/
  unit/               Vitest: CSV, RNG/statistics, draws, auth, projector sync, Firestore (emulator)
  e2e/                Playwright: login, live spin + projector, reconnection, void/redraw, CSV import
```

The raffle logic is written once against a small `DocStore` interface. In production it runs on **Cloud Firestore** through the Admin SDK. Locally and in tests it runs on an in-memory store with the same transaction semantics. The emulator test suite runs the key guarantees against real Firestore.

### Data model (Firestore)

Each environment lives in its own namespace, so demo actions can never touch production:

| Path | Contents |
| --- | --- |
| `envs/{env}/participants/{participantId}` | attendeeId, name, email, ticketNumber, company, eligibilityStatus, hasWon, prizeId, drawId, timestamps |
| `envs/{env}/prizes/{prizeId}` | name, description, imageUrl, quantity, remainingQuantity, drawOrder, status, drawCount |
| `envs/{env}/draws/{drawId}` | prize, participant, name/ticket snapshots, eligiblePoolSize, eligibilityVersion, status, statusHistory[], initiatedBy, timestamps, voidReason, idempotencyKey |
| `envs/{env}/raffleState/main` | status, currentPrizeId, activeDrawId, drawSequence, counts, eligibilityVersion, drawLock, wheel state |
| `envs/{env}/auditLogs/{eventId}` | eventType, organizerId, entityId, timestamp, details |
| `envs/{env}/imports/{importId}` | import fingerprint record (prevents duplicate imports) |
| `envs/{env}/idempotency/{key}` | draw idempotency keys |
| `publicDisplay/{env}` | **Projector-safe** state only: prize, counts, spin timing, revealed name and ticket. No emails. |

`{env}` is `production` or `demo`.

**Security rules** (`firestore.rules`) let browsers read only `publicDisplay/{env}`. Everything else is denied to clients. The server uses the Admin SDK, and every API call is authenticated and authorized server-side. The emulator suite tests these rules.

**Indexes**: every query uses single-field indexes, which Firestore creates automatically. `firestore.indexes.json` is intentionally empty.

### Winner lifecycle

`Selected → Announced → Confirmed → Claimed`, with **Absent** and **Voided** as alternatives.

- A selected winner is excluded from future draws immediately, including while awaiting confirmation.
- **Void** requires a reason. The record stays in history as voided, and the prize quantity is returned.
- A voided winner is **not** returned to eligibility automatically. Restoring them is a separate action on the Participants page.
- Every status change is appended to the draw's `statusHistory` and written as an audit event. Original results are never overwritten or deleted.

### Projector sync

The projector listens to `publicDisplay/{env}` with a Firestore real-time listener, or polls `/api/display` when Firebase web config is missing (or `NEXT_PUBLIC_DISPLAY_SYNC=poll`).

Spins are a function of **server time**: rotation = f(now − spin start). Because of that:

- a projector that reconnects mid-spin joins the animation at the right point;
- one that reconnects after a spin shows the result without replaying the spin or confetti;
- the control page and the projector always agree.

A small status pill (Live / Reconnecting / Offline) shows connection health for the operator.

---

## Local development

Requirements: Node.js 20.9+ (tested on Node 26).

```bash
npm install
cp .env.example .env.local     # defaults: memory backend + dev login
npm run dev
```

1. Open http://localhost:3000/login and sign in with `organizer@example.com` through the dev form. Dev login only works when `AUTH_MODE=dev`, and never in a production build.
2. The dashboard starts in **Demo** mode with 300 fictional attendees and sample prizes.
3. Open http://localhost:3000/display?env=demo in another window and spin from **Control**.

The memory backend persists to `.data/raffle-store.json` so demo data survives restarts. Delete that folder to start fresh.

To use Google sign-in locally, fill in the `NEXT_PUBLIC_FIREBASE_*` variables and add `localhost` to the authorized domains in Firebase Auth. To use Firestore locally, set `DATA_BACKEND=firestore` and provide Admin credentials (see `.env.example`).

### Tests

```bash
npm run typecheck
npm run lint
npm test                # Vitest unit/integration (in-memory store)
npm run test:e2e        # Playwright (starts its own dev server on :3200)
npm run test:emulator   # Firestore store + security rules against the emulator
```

`test:e2e` needs a Playwright browser installed once (`npx playwright install chromium`). It can't run while another `next dev` is using `.next` in this folder.

`test:emulator` needs the Firebase CLI (`npm i -g firebase-tools`) and a Java runtime. Java 21+ is recommended; current CLI versions warn on older ones.

---

## Firebase setup (one-time)

You need a Firebase project on the **Blaze** plan, which App Hosting requires. No credentials are included in this repo. Use your own.

1. **Create the project** in the [Firebase console](https://console.firebase.google.com/).
2. **Firestore**: Build → Firestore Database → Create database, **Native mode**. Pick a region close to the venue, such as `northamerica-northeast2` (Toronto). Start in production mode, because the rules in this repo deny clients by default.
3. **Authentication**: Build → Authentication → Get started → Sign-in method → enable **Google**, and set the support email. Under Settings → **Authorized domains**, add your App Hosting domain (`<backend>--<project>.<region>.hosted.app`) and any custom domain.
4. **Web app**: Project settings → General → Your apps → add a **Web** app. App Hosting passes this config to the build automatically (`FIREBASE_WEBAPP_CONFIG`, mapped in `next.config.ts`). For local use, copy the values into `.env.local`.
5. **Deploy rules and indexes**:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add            # select your project
   firebase deploy --only firestore
   ```

### Organizer access

Choose one or both methods. The server checks them on every request.

- **Allowlist (simplest).** Store comma-separated emails in the `organizer-emails` secret, which `apphosting.yaml` maps to `ORGANIZER_EMAILS`:
  ```bash
  firebase apphosting:secrets:set organizer-emails
  # enter: lead@yourdomain.com,volunteer@gmail.com
  ```
- **Custom claim.** After a person has signed in once:
  ```bash
  node scripts/set-organizer-claim.mjs --project <project-id> person@yourdomain.com
  ```
  They must sign in again for the claim to take effect. Use `--revoke` to remove it.

Only **verified** Google emails are accepted. Sessions are httpOnly, `SameSite=Strict` cookies that last 8 hours. Signing out revokes the session everywhere.

---

## Deploying to Firebase App Hosting

1. Push this project to a GitHub repository.
2. Create the backend. You can use the console (Build → App Hosting → Get started), connect the repo, set root directory `/`, and link the web app from step 4 above. Or use the CLI:
   ```bash
   firebase apphosting:backends:create --project <project-id>
   ```
   The backend ID in `firebase.json` is `devfest-raffle`. Change it if you choose another.
3. Grant the backend access to the secret:
   ```bash
   firebase apphosting:secrets:grantaccess organizer-emails --backend devfest-raffle
   ```
4. **Check IAM.** The App Hosting runtime service account (`firebase-app-hosting-compute@<project>.iam.gserviceaccount.com`) needs:
   - **Cloud Datastore User** (`roles/datastore.user`) to read and write Firestore;
   - **Firebase Authentication Admin** (`roles/firebaseauth.admin`) to create and verify session cookies and check revocation.

   Grant them under Google Cloud console → IAM if they're missing.
5. **Deploy.** Every push to the live branch rolls out automatically. You can also deploy manually with `firebase deploy --only apphosting`.

`apphosting.yaml` sets `DATA_BACKEND=firestore` and keeps one instance warm (`minInstances: 1`) so the first spin isn't a cold start. The production server refuses to start on the in-memory backend unless you explicitly set `ALLOW_MEMORY_BACKEND=true`.

After deploying, sign in at `/login`, practice in Demo mode, then switch to **Production** using the header toggle, which asks for confirmation.

---

## Security summary

- Google sign-in with server-side authorization on every page and API call: allowlist or custom claim, verified email required, revocation checked.
- CSRF protection: `SameSite=Strict` cookie, JSON-only bodies, and an Origin check on every state-changing request.
- All privileged operations run on the server. The projector can't start or authorize anything.
- Winner selection uses `crypto.randomInt` over the full eligible pool, with an atomic transactional commit, a draw lock, eligibility-version validation, and idempotency keys.
- The public state never contains emails or other private fields. Firestore rules deny clients everything except that document.
- Zod validation on every input. The server re-validates CSV imports, so the client's review is never trusted.
- CSV exports neutralize formula injection (`= + - @` prefixes).
- Immutable draw history: status changes are appended, and there are no deletes.
- An audit log covers imports, participant and prize changes, draws, voids, exports, and demo resets.
- Production can't be reset from the app. Demo reset requires typing `RESET DEMO`.
- Security headers (`nosniff`, frame denial outside `/display`, referrer policy) and error boundaries. The projector's error boundary retries automatically.

## Branding

The wheel center and header use `public/branding/devfest-toronto-2026.svg`, an original placeholder. Replace that file or set `NEXT_PUBLIC_BRAND_LOGO_URL` to use official artwork. Prize images accept `https://` URLs or files you add under `public/`.

## CSV format

Download a template from the import page, or use [`public/templates/attendees-template.csv`](public/templates/attendees-template.csv):

```csv
attendeeId,name,email,ticketNumber,company
001,Alex Johnson,alex@example.com,DF001,Example Inc.
```

- Only `name` is required.
- Headers are detected automatically, and differently named columns can be mapped.
- Duplicates are matched on attendee ID, email (case-insensitive), and ticket number. **Names alone never merge or exclude anyone.**
- Re-importing the same file is refused.
- For practice, [`public/templates/practice-300-attendees.csv`](public/templates/practice-300-attendees.csv) has 300 fictional rows.
