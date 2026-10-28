# Balena Reel Studio

A private, responsive web app (MacBook + iPad) for turning your own coffee footage into Facebook Reels:

**Google Drive footage → edit draft with Claude → FFmpeg render → Thai caption → product → review/approve → plan → publish → confirm on Facebook.**

Everything runs in **clearly labelled demo mode** first, so every screen can be reviewed before any real account is connected. Simulated behaviour is always marked "Demo", "Simulated" or "Demo stand-in" in the UI, and is never reported as a finished integration.

---

## Feature status

| Area | Status | Notes |
|---|---|---|
| Responsive UI (all 9 screens, onboarding, sign-in) | ✅ Working | Full sidebar ≥1024 px, icon rail on iPad portrait, drawer on phones. Editor switches to tabs below 1280 px. |
| Design tokens + reusable components | ✅ Working | `src/app/globals.css` (`@theme`), `src/components/ui/*` (Radix primitives) |
| Persistent drafts, optimistic concurrency, local unsaved-work recovery | ✅ Working | Autosave ~1 s after you stop typing; a conflict from another device triggers a prompt instead of an overwrite; offline edits are kept in localStorage until the server confirms them |
| Cross-device sync | ✅ Working with managed Postgres | Pages refresh on focus, when the network returns, and on a polling interval. Demo mode uses local PGlite on one machine. |
| Single-user auth (Google sign-in, allowlisted email) | ✅ Implemented, ⚠️ untested against live Google | OIDC code flow with PKCE, ID token verified via Google JWKS, signed httpOnly session cookie |
| Durable job queue + always-on worker | ✅ Working | Postgres `jobs` table with `FOR UPDATE SKIP LOCKED`, retry/backoff, stale-lock recovery, plan sweep, heartbeat |
| FFmpeg rendering (1080×1920, H.264/AAC, Thai subtitles, logo, music) | ✅ Working (tested) | libass + HarfBuzz with bundled Prompt / Noto Sans Thai (OFL) |
| Approval rules (re-render, caption or product change ⇒ approve again) | ✅ Working (tested) | Approval is bound to a hash of render + caption + product, and re-checked when publishing runs |
| Publishing state machine + duplicate prevention | ✅ Working against the simulated Facebook adapter (tested) | Upload, processing, schedule and publication tracked separately; "Published" only after a status read confirms it; an ambiguous response triggers a status check, never a blind retry |
| Google Drive (browse, search, thumbnails, stream, download, upload renders) | 🟡 Implemented, **not yet run against live Drive** | `DRIVE_ADAPTER=google` |
| Facebook Page Reels publishing | 🟡 Implemented, **not yet run against live Meta** | `FACEBOOK_ADAPTER=graph`. See [Facebook verification checklist](#facebook-verification-checklist). |
| Claude edit plan + Thai copy | 🟡 Implemented, **not yet run with a live key** | `CLAUDE_ADAPTER=anthropic`. Demo mode uses a fixed template and says so. |
| Native Facebook product tags | ❌ Not automated (by design) | Manual tagging handoff after publication; saved URL and native tag are separate fields |
| Email/push notifications | ❌ Not built | Preferences are stored; notices appear in Activity and the bell icon |
| Remotion overlays | ❌ Not used | FFmpeg covers subtitles, logo and music. The render adapter boundary leaves room for Remotion later. |

---

## Quick start (demo mode, local)

Requirements: Node 22+, pnpm 10, FFmpeg (optional but recommended: real renders and generated demo footage).

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:3000. On first start the app:

- creates an embedded PGlite database in `.data/pglite` and seeds labelled demo data
- generates watermarked demo clips with FFmpeg in `.data/demo-drive` (about 30 s)
- starts an **embedded** job runner, so renders and simulated publishing work locally

Sign-in is disabled locally while `GOOGLE_CLIENT_ID` is empty. That is refused in production.

To open it on your iPad on the same Wi-Fi, use `http://<your-mac-ip>:3000`. The data lives on the Mac in demo mode.

---

## Architecture

```
 Browser (MacBook / iPad)                 Web app (Next.js 16, Node runtime)
 ─────────────────────────               ──────────────────────────────────────
 React UI, autosave, local      ──RSC──▶  Server components (reads)
 unsaved-work safety copy       ──SA───▶  Server actions (zod-validated writes)
 /api/media/* (proxied video)   ◀──────   Media proxy (Drive bytes, Range support)
                                          OAuth routes (Google sign-in, Drive, Facebook)
                                                     │
                                                     ▼
                                     Managed Postgres (shared state + job queue)
                                                     ▲
                                                     │ claim jobs (SKIP LOCKED)
                                          Worker (always-on container, FFmpeg)
                                          render · claude_draft · drive_sync · publish
                                                     │
                       ┌─────────────────────────────┼─────────────────────────────┐
                 Google Drive API              Anthropic API              Facebook Graph API
```

- **Adapter boundary** (`src/server/adapters/types.ts`): `DriveAdapter`, `ClaudeAdapter`, `RenderAdapter`, `FacebookAdapter`, each with a demo and a live implementation chosen by environment variables.
- **No long work in web requests**: server actions only enqueue jobs. Renders, drafts, syncs and publishing run in the worker.
- **Scheduled work continues when your devices are off**: the worker owns publishing. Jobs and plans are persisted, a sweep re-creates missing publish jobs, and stale locks are recovered.
- **Secrets stay server-side**: tokens are AES-256-GCM encrypted in the database (`TOKEN_ENCRYPTION_KEY`). Media is proxied, so the browser never sees a Drive or Facebook token. No `NEXT_PUBLIC_*` variables are used.

### Data model (`src/server/db/schema.ts`)

`footage` (stable Drive file id, source vs rendered, availability) · `projects` (stage, status, brief, Thai caption, subtitles, version) · `clip_edits` · `products` (verified facts, destination URL, **separate** native-tag eligibility) · `brand_kit` · `render_versions` (edit snapshot + hash) · `approvals` (content hash) · `publish_plans` (local status **and** separate Facebook upload/processing/schedule/publish outcomes, idempotency key, `fb_video_id`, `finish_requested_at`) · `publish_attempts` (request log) · `jobs` · `activity_events` · `connections` · `settings`.

All timestamps are `timestamptz` (UTC) and are shown in the selected timezone, which defaults to **Asia/Bangkok** and is displayed on the calendar, in plan forms and in Activity.

### Publishing rules (`src/lib/domain/publish.ts`)

1. Nothing is sent to Facebook unless the draft is approved for its **current** render, caption and product. This is checked again when publishing runs.
2. Each plan owns at most one Facebook video object. Once an upload session exists, the worker never starts a second one on its own.
3. `finish_requested_at` is saved **before** the finish call, the step that actually publishes or schedules.
4. If the finish response is lost or ambiguous (timeout, 5xx), the plan becomes **"Checking with Facebook"** and the worker only reads status. It never re-sends.
5. A definite rejection (4xx) means nothing was published, so a retry is safe and reuses the same video id.
6. "Published" is shown only after a status read confirms it. "Scheduled by Meta" is shown only after Meta confirms a scheduled Reel. "Planned · local" means nothing has left Balena.
7. Two publishing methods:
   - **Balena publisher** (default): the worker uploads up to 2 h early, then finishes as `PUBLISHED` at the planned time. Easy to edit or cancel until then.
   - **Meta-native scheduling**: `video_state=SCHEDULED` with `scheduled_publish_time`, restricted to 15 min – 28 days ahead.

---

## Recommended services and costs

> Prices change. Check each provider's pricing page before subscribing. This build couldn't reach provider sites to re-verify.

| Need | Recommendation | Cost expectation |
|---|---|---|
| Database (shared across devices) | **Neon** Postgres (or Supabase Postgres). Only Postgres is used; auth is built in. | Free tier to start. The worker polls the database, so a scale-to-zero free tier may run out of compute hours. Budget for the lowest paid tier if that happens. Supabase's free tier pauses inactive projects, which doesn't suit unattended scheduling. |
| Worker (FFmpeg, always on) | Any container host: **Railway**, **Render** (Background Worker), **Fly.io**. Use `Dockerfile.worker`. | Paid, small: roughly US$5–15/month for a 1–2 GB RAM instance |
| Web app | **Vercel Pro** (Hobby is for non-commercial use), or run `next start` on the same host as the worker | Vercel Pro ~US$20/month, or the cost of one more small service |
| Claude | **Anthropic API** key. A Claude.ai subscription does **not** include API usage. | Pay per use. One draft with keyframes is roughly a few cents to ~US$0.15 on `claude-opus-5-5`. Set `CLAUDE_MODEL=claude-sonnet-5-5` to roughly halve it. |
| Google OAuth / Drive API | Google Cloud project | Free |
| Meta app | developers.facebook.com | Free |

The cheapest reliable setup is one small always-on host running both `next start` and `pnpm worker`, plus Neon.

---

## Production setup

1. **Database**: create a Neon (or Supabase) Postgres database and set `DATABASE_URL`. Migrations run automatically on boot, or run `pnpm db:migrate`.
2. **Secrets**: generate `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`. Set `ALLOWED_EMAIL`.
3. **Google Cloud**
   - Create an OAuth client of type *Web application*. Redirect URIs: `${APP_URL}/api/auth/google/callback` and `${APP_URL}/api/connect/google-drive/callback`.
   - Enable the **Google Drive API**.
   - Scopes: sign-in uses `openid email profile`. The Drive connection asks separately for `drive.readonly` (browse/search/download footage) and `drive.file` (create Balena's renders folder and upload renders). The full `drive` scope is never requested.
   - ⚠️ `drive.readonly` is a *restricted* scope. While the consent screen is in **Testing**, add your account as a test user. Google expires refresh tokens after **7 days** in Testing, so you'd need to reconnect weekly. To avoid that, either use a Google Workspace account with an **Internal** consent screen, or publish the app (restricted scopes then require Google verification). The app shows an "expired session → Reconnect" state when this happens.
   - Set `DRIVE_ADAPTER=google`.
4. **Meta**
   - Create an app with **Facebook Login for Business**. Add `${APP_URL}/api/connect/facebook/callback` as a valid OAuth redirect URI.
   - Request `pages_show_list`, `pages_read_engagement` and `pages_manage_posts`. While the app is in Development mode, these work for people who have a role on the app. App Review is needed only if other people will use it.
   - Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_ADAPTER=graph`, and `FACEBOOK_GRAPH_VERSION` (currently `v26.0`).
5. **Claude**: set `ANTHROPIC_API_KEY` and `CLAUDE_ADAPTER=anthropic`. Optionally set `CLAUDE_MODEL`.
6. **Deploy the web app** with `pnpm build && pnpm start` (or Vercel), with `WORKER_MODE=external`.
7. **Deploy the worker** with `Dockerfile.worker` (it runs `pnpm worker`), using the same environment variables. Settings → Connections shows its heartbeat.
8. **Sign in**, connect Drive and Facebook from **Settings**, choose a source folder in **Library**, and fill in **Brand Kit** and **Products**. **Setup guide** (`/onboarding`) tracks progress.
9. Before going live, set `SEED_DEMO_DATA=false` on a fresh database.

### Facebook verification checklist

The Meta developer docs were unreachable from the build environment. The flow follows Meta's published *Reels Publishing API* (Graph API v26.0 `video_reels` reference) as summarised in search results. Before relying on it, confirm:

- [ ] `POST /{page-id}/video_reels?upload_phase=start` returns `video_id` and `upload_url`
- [ ] Binary upload to `rupload.facebook.com/video-upload/{ver}/{video_id}` with the `Authorization: OAuth <page token>`, `offset` and `file_size` headers
- [ ] `upload_phase=finish` with `video_state=PUBLISHED|SCHEDULED`, `scheduled_publish_time` (unix seconds) and `description`
- [ ] `GET /{video_id}?fields=status,permalink_url,published`: field names for the uploading, processing and publishing phases, and the `publish_status` values (`src/server/adapters/facebook/graph.ts`, `getStatus`)
- [ ] Current scheduling window for Reels (the app is deliberately conservative: 15 min – 28 days)
- [ ] Reels specs (9:16, duration limits). Renders are 1080×1920 at 30 fps, H.264/AAC, `faststart`.
- [ ] Product tagging is **not** offered by this API. Affiliate marketplace items such as Shopee are not natively taggable. The app uses a manual handoff.

Test against your Page with a throwaway Reel, plan it with "Balena publisher" a few minutes ahead, and check the request log in the plan panel.

---

## Testing

```bash
pnpm test
```

Unit and integration tests (Vitest, in-memory PGlite, **real FFmpeg**, simulated Facebook with fault injection):

- timezone conversion, calendar grids and DST handling
- approval invalidation (re-render, caption, product)
- publish state machine, plus the full publish flow: exactly one finish call, and an ambiguous response is reconciled without re-sending
- a definite rejection followed by a retry on the same video id
- stale-version rejection (cross-device conflict)
- Thai copy guard and ASS escaping
- a real Thai-subtitled 1080×1920 render

```bash
pnpm build
```

```bash
pnpm test:e2e
```

End-to-end tests (Playwright, production build, demo mode, isolated database):

- main workflow (create → trim/reorder → demo draft → Thai subtitle → render → approve → plan → agenda)
- MacBook ↔ iPad persistence of drafts and preferences
- 44 px touch targets on the iPad editor
- calendar dates in Bangkok vs London
- re-render invalidating approval

Run the worker against Postgres locally:

```bash
DATABASE_URL=postgres://… pnpm worker
```

---

## Accessibility and device UX

- Every control is at least 44×44 px. The iPad editor has an automated check.
- Nothing requires hover or drag-and-drop: reordering uses arrow buttons, trimming uses steppers and sliders, and selection uses toggles.
- Visible focus rings, skip link, ARIA labels, live save status, keyboard-operable timeline (←/→, Shift for 5 s).
- `prefers-reduced-motion` disables animation. Safe-area insets are respected. `interactive-widget=resizes-content` and scroll margins keep focused fields above the iPad keyboard.
- Approval actions sit in a sticky bottom bar within thumb reach.

## Project layout

```
src/app/(app)/*          screens (server components) + client views
src/app/actions.ts       server actions (auth + zod)
src/app/api/*            OAuth, media proxy, health
src/components/ui        design-system primitives
src/components/editor    editing workspace (preview, timeline, panels, autosave)
src/lib                  pure domain logic (time, approval, publish, copy guard, ASS)
src/server               db, adapters, services, jobs (shared with the worker)
worker/                  worker entry + bundled Thai fonts (OFL)
drizzle/                 SQL migrations
tests/unit, tests/e2e
```
