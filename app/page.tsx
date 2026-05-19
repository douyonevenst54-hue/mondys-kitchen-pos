import { cookies } from "next/headers";
import { logout } from "@/app/login/actions";

type Session = { staffId: string; name: string; role: string };

async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const session = await getSession();

  return (
    <main className="min-h-screen bg-mondy-cream p-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-mondy-border">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.24em] text-mondy-red-dark">
            Signed In
          </p>
          <h1 className="mt-2 font-display text-4xl font-black text-mondy-ink">
            Welcome, {session?.name ?? "Guest"}
          </h1>
          <p className="mt-1 font-sans text-sm text-mondy-muted">
            Role: {session?.role ?? "—"}
          </p>

          <div className="mt-8 rounded-2xl bg-mondy-yellow-soft/40 p-5 ring-1 ring-mondy-yellow-deep/30">
            <p className="font-display text-lg text-mondy-ink">
              The cashier interface is next.
            </p>
            <p className="mt-1 font-sans text-sm text-mondy-muted">
              In the next session we&apos;ll build the menu grid, cart, and checkout flow on top of this auth shell.
            </p>
          </div>

          <form action={logout} className="mt-8">
            <button
              type="submit"
              className="rounded-xl bg-mondy-ink px-5 py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
