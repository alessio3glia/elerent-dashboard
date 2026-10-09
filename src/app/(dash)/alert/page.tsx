import Link from "next/link";
import { Card, Empty, PageHeader, SeverityBadge } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { recentAlerts } from "@/lib/queries";

export default async function AlertsPage() {
  const rows = await recentAlerts(14);
  const days = [...new Set(rows.map((r) => r.alert.day))];
  return (
    <>
      <PageHeader title="Alert" subtitle="Segnali rilevati negli ultimi 14 giorni, dal più recente." />
      {days.length === 0 && <Empty>Nessun alert negli ultimi 14 giorni.</Empty>}
      <div className="space-y-6">
        {days.map((day) => (
          <Card key={day} title={formatDay(day)}>
            <ul className="divide-y divide-line">
              {rows
                .filter((r) => r.alert.day === day)
                .map(({ alert, city }) => (
                  <li key={alert.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="w-28 shrink-0"><SeverityBadge severity={alert.severity} /></div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        <Link href={`/citta/${city.slug}`} className="hover:text-brand">{alert.title}</Link>
                      </div>
                      <div className="text-sm text-ink-2">{alert.detail}</div>
                    </div>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
