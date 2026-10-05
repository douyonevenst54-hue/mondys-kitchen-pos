import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { getPortionDay, type PortionDayEvent } from "@/lib/portions";
import { addDays, businessDate, isBusinessDate } from "@/lib/business-date";

type SearchParams = Promise<{ date?: string }>;

const TYPE_LABEL: Record<PortionDayEvent["type"], string> = {
  COUNT: "Count",
  ADD: "Batch added",
  REMOVE: "Removed",
  SALE: "Sold",
  VOID: "Void returned",
};

function signed(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export default async function PortionReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const settings = await getSettings();
  const today = businessDate(settings.timezone);
  const params = await searchParams;
  const date =
    isBusinessDate(params.date) && params.date <= today ? params.date : today;

  const { rows, events } = await getPortionDay(date);

  const longDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: settings.timezone,
  });

  const navLink =
    "flex items-center gap-1 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream";

  return (
    <main className="min-h-screen bg-mondy-cream px-4 py-6 sm:px-6">
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <Link href="/menu/portions" className={navLink}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Portion counts
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/reports/portions?date=${addDays(date, -1)}`} className={navLink}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Previous
          </Link>
          {date !== today && (
            <>
              <Link href="/reports/portions" className={navLink}>
                Today
              </Link>
              <Link
                href={`/reports/portions?date=${addDays(date, 1)}`}
                className={navLink}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </>
          )}
        </div>
      </div>

      <article className="mx-auto max-w-4xl bg-white p-6 ring-1 ring-mondy-border sm:p-8">
        <header className="border-b border-mondy-border pb-4">
          <h1 className="font-display text-2xl font-black text-mondy-ink">
            Portion log
          </h1>
          <p className="mt-0.5 font-sans text-sm text-mondy-muted">{longDate}</p>
        </header>

        {rows.length === 0 ? (
          <p className="py-12 text-center font-sans text-sm text-mondy-muted">
            No portion changes on this day.
          </p>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] font-sans text-sm">
                <thead>
                  <tr className="border-b border-mondy-border text-left text-xs text-mondy-muted">
                    <th className="py-2 pr-3 font-medium">Dish</th>
                    <th className="px-2 py-2 text-right font-medium">Carried in</th>
                    <th className="px-2 py-2 text-right font-medium">Count diff.</th>
                    <th className="px-2 py-2 text-right font-medium">Added</th>
                    <th className="px-2 py-2 text-right font-medium">Sold</th>
                    <th className="px-2 py-2 text-right font-medium">Removed</th>
                    <th className="px-2 py-2 text-right font-medium">Voids back</th>
                    <th className="py-2 pl-2 text-right font-medium">Left</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {rows.map((r) => (
                    <tr key={r.menuItemId} className="border-b border-mondy-border/60">
                      <td className="py-2.5 pr-3 font-medium text-mondy-ink">{r.name}</td>
                      <td className="px-2 py-2.5 text-right">{r.carriedIn}</td>
                      <td
                        className={`px-2 py-2.5 text-right ${
                          r.countChange < 0 ? "font-semibold text-mondy-red" : ""
                        }`}
                      >
                        {signed(r.countChange)}
                      </td>
                      <td className="px-2 py-2.5 text-right">{r.added || "–"}</td>
                      <td className="px-2 py-2.5 text-right">{r.sold || "–"}</td>
                      <td className="px-2 py-2.5 text-right">{r.removed || "–"}</td>
                      <td className="px-2 py-2.5 text-right">{r.voidedBack || "–"}</td>
                      <td className="py-2.5 pl-2 text-right font-display text-base font-bold text-mondy-ink">
                        {r.left}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 font-sans text-xs text-mondy-muted">
              Carried in + count diff. + added − sold − removed + voids back = left.
              A negative count difference means fewer portions were found than the
              system expected.
            </p>

            <h2 className="mt-8 font-display text-lg font-bold text-mondy-red-dark">
              Every change
            </h2>
            <ol className="mt-2 divide-y divide-mondy-border/60 font-sans text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                  <span className="w-20 shrink-0 tabular text-mondy-muted">
                    {time.format(e.at)}
                  </span>
                  <span className="min-w-0 flex-1 text-mondy-ink">
                    <span className="font-medium">{e.itemName}</span>{" "}
                    <span className="text-mondy-muted">
                      {TYPE_LABEL[e.type]}
                      {e.orderNumber != null && ` on order #${e.orderNumber}`}
                      {e.reason && ` (${e.reason})`}, by {e.staffName}
                    </span>
                  </span>
                  <span className="tabular">
                    {signed(e.change)}{" "}
                    <span className="text-mondy-muted">→ {e.balanceAfter}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </article>
    </main>
  );
}
