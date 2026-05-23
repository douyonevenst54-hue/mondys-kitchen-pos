import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CloseShiftForm } from "@/components/shift/CloseShiftForm";

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

export default async function CloseShiftPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const shift = await prisma.shift.findFirst({
    where: { staffId: session.staffId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!shift) {
    // No open shift to close — bounce back home.
    redirect("/");
  }

  // Pre-compute expected cash so the form can display it
  const cashPayments = await prisma.payment.aggregate({
    where: {
      method: "CASH",
      status: "COMPLETED",
      order: { shiftId: shift.id },
    },
    _sum: { amount: true },
  });
  const cashIn = Number(cashPayments._sum.amount ?? 0);
  const openingCash = Number(shift.openingCash);
  const expectedCash = openingCash + cashIn;

  return (
    <main className="min-h-screen bg-mondy-cream px-4 py-8 sm:py-16">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <header className="mb-6 text-center">
          <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
            End of Shift
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-mondy-ink">
            Wrap up &amp; reconcile
          </h1>
        </header>
        <CloseShiftForm
          shiftId={shift.id}
          openingCash={openingCash}
          expectedCash={expectedCash}
          cashIn={cashIn}
          staffName={session.name}
          startedAt={shift.startedAt}
        />
      </div>
    </main>
  );
}