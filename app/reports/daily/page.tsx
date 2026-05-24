import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDailyReport } from "@/lib/orders";
import { getSettings } from "@/lib/menu";
import { DailyReportView } from "@/components/reports/DailyReportView";

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

type SearchParams = Promise<{ date?: string }>;

// Parse a YYYY-MM-DD string in local time. Returns today at midnight if the
// input is missing or malformed.
function parseDateParam(input: string | undefined): Date {
  if (input) {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatDateParam(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Only managers and owners can see reports — cashiers don't get to peek at
  // revenue totals. Soft gate; can be relaxed later.
  if (session.role === "CASHIER") redirect("/");

  const params = await searchParams;
  const date = parseDateParam(params.date);

  const [report, settings] = await Promise.all([
    getDailyReport(date),
    getSettings(),
  ]);

  // Previous / next day for navigation
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = date.getTime() === today.getTime();
  const isFuture = date.getTime() > today.getTime();

  return (
    <DailyReportView
      report={report}
      settings={settings}
      prevDateParam={formatDateParam(prevDate)}
      nextDateParam={isToday || isFuture ? null : formatDateParam(nextDate)}
      todayDateParam={formatDateParam(today)}
      isToday={isToday}
    />
  );
}