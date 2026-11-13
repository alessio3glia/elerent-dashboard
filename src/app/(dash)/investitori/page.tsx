import Link from "next/link";
import { sql } from "drizzle-orm";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { InvestorForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function InvestorsPage() {
  await requireAdmin();
  const rows = await db.execute<{ id: number; name: string; email: string; share_pct: number | null; vehicles: number; has_password: boolean }>(sql`
    select i.id, i.name, i.email, i.share_pct, (i.password_hash is not null) as has_password,
           count(iv.id) filter (where iv.to_day is null or iv.to_day >= current_date)::int as vehicles
    from investors i left join investor_vehicles iv on iv.investor_id = i.id
    group by i.id order by i.name`);
  return (
    <>
      <PageHeader
        title="Investitori"
        subtitle="Chi possiede i veicoli. Ogni investitore entra dalla stessa pagina di login con la sua email e vede solo i propri veicoli, con ricavo lordo e la sua quota."
      />
      <Card title="Elenco" className="mb-6">
        {rows.length === 0 ? (
          <Empty>Nessun investitore ancora. Crealo qui sotto, poi assegnagli i veicoli.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Nome</th><th>Email</th><th className="text-right">Veicoli</th><th className="text-right">Quota</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-ink-2">{r.email}</td>
                  <td className="tabular text-right">{r.vehicles}</td>
                  <td className="tabular text-right">{r.share_pct === null ? "solo lordo" : `${r.share_pct}%`}</td>
                  <td className="text-right">
                    <Link href={`/investitori/${r.id}`} className="text-sm text-brand hover:underline">Apri</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Nuovo investitore">
        <InvestorForm />
      </Card>
    </>
  );
}
