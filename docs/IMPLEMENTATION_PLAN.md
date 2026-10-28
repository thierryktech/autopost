# Implementation plan (as delivered)

The repository started empty apart from a README.

1. **Foundation**: Next.js 16 (App Router, TypeScript), Tailwind v4 design tokens, Radix primitives, Drizzle ORM. Postgres schema with embedded PGlite for demo mode and managed Postgres for production.
2. **Domain core** (pure, unit-tested): timezone utilities (Asia/Bangkok default), approval hashing and invalidation, the publishing state machine with duplicate-prevention rules, the Thai copy guard, and ASS subtitle generation.
3. **Adapter boundary**: Drive, Claude, Render and Facebook interfaces, each with a labelled demo implementation and a live one.
4. **Durable jobs**: Postgres-backed queue, plus handlers for render (FFmpeg), Claude draft, Drive sync and publish/reconcile. Runs in a standalone worker in production, or embedded in the web server in demo mode.
5. **Demo workspace**: seeded data, plus locally generated watermarked footage so every screen and the real render pipeline work offline.
6. **Responsive UI**: shell (sidebar, iPad rail, phone drawer), Overview, Drive Library, Create Reel workspace (4 stages), Review Queue and detail, Calendar (week/month/agenda), Products, Brand Kit, Activity, Settings, Onboarding, Sign-in.
7. **Persistence and auth**: server actions with zod validation, optimistic concurrency, local unsaved-work recovery, cross-device refresh, Google sign-in restricted to one email, encrypted token storage.
8. **Integrations**: official OAuth flows for Google Drive (`drive.readonly` + `drive.file`) and Facebook Pages, Graph API Reels flow, Anthropic structured-output drafting with keyframes.
9. **Verification**: Vitest unit and integration tests (real FFmpeg and Thai render, ambiguous publish responses, approval invalidation, conflicts), Playwright end-to-end tests (main workflow, cross-device, calendar timezones, approval invalidation, touch targets), and a worker run against a real Postgres.

Remaining live-integration steps are listed in the README ("Feature status" and "Facebook verification checklist").
