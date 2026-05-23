import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OpenShiftForm } from "@/components/shift/OpenShiftForm";
import { getCurrentShift } from "@/app/api/orders/actions";

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

export default async function OpenShiftPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // If a shift is already open for this user, no need to be here.
  const existing = await getCurrentShift(session.staffId);
  if (existing) redirect("/");

  return (
    <main className="min-h-screen bg-mondy-cream px-4 py-8 sm:py-16">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <header className="mb-6 text-center">
          <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
            Welcome, {session.name}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-mondy-ink">
            Let&apos;s get started
          </h1>
        </header>
        <OpenShiftForm />
      </div>
    </main>
  );
}