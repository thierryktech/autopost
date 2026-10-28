import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { env } from "@/server/env";
import { Logo } from "@/components/shell/logo";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_allowed: "That Google account isn’t allowed to use this studio.",
  denied: "Sign-in was cancelled.",
  not_configured: "Google sign-in isn’t configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ALLOWED_EMAIL.",
  failed: "Sign-in failed. Please try again.",
  no_id_token: "Google didn’t return an identity token. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; signed_out?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const sp = await searchParams;
  const configured = !!env.googleClientId;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 safe-pt safe-pb">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-8 text-center shadow-[var(--shadow-raised)]">
        <div className="mx-auto mb-6 w-fit rounded-2xl bg-teal-900 px-6 py-4">
          <Logo />
        </div>
        <h1 className="text-xl font-semibold text-ink-900">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-500">This is a private studio for one account.</p>
        {sp.error && <p role="alert" className="mt-4 rounded-xl bg-danger-100 px-3 py-2 text-sm text-danger-700">{ERRORS[sp.error] ?? ERRORS.failed}</p>}
        {sp.signed_out && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">You’re signed out.</p>}
        <a
          href="/api/auth/google/start"
          aria-disabled={!configured}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-line-strong bg-white px-4 font-semibold text-ink-900 hover:bg-teal-50 aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7H2.1a11 11 0 0 0 0 10z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
          </svg>
          Continue with Google
        </a>
      </div>
    </main>
  );
}
