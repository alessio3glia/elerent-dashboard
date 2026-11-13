import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { deleteInvestor, removeVehicle, updateVehiclePeriod } from "@/app/actions/investors";
import { InvestorView } from "@/components/investor-view";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { AssignVehiclesForm, InvestorForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function InvestorDetailPage({ params }: PageProps<"/investitori/[id]">) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [investor] = await db.select().from(schema.investors).where(eq(schema.investors.id, id));
  if (!investor) notFound();
  const assigned = await db
    .select({
      id: schema.investorVehicles.id,
      atomId: schema.investorVehicles.vehicleAtomId,
      fromDay: schema.investorVehicles.fromDay,
      toDay: schema.investorVehicles.toDay,
      number: schema.vehicles.number,
      city: schema.cities.name,
    })
    .from(schema.investorVehicles)
    .leftJoin(schema.vehicles, eq(schema.vehicles.atomId, schema.investorVehicles.vehicleAtomId))
    .leftJoin(schema.cities, eq(schema.cities.id, schema.vehicles.cityId))
    .where(eq(schema.investorVehicles.investorId, id))
    .orderBy(asc(schema.vehicles.number));

  return (
    <>
      <PageHeader title={investor.name} subtitle={`Accesso: ${investor.email} · ${investor.sharePct === null ? "vede solo il lordo" : `quota ${investor.sharePct}% sul lordo`}`}>
        <Link href="/investitori" className="text-sm text-ink-2 hover:text-brand">← Investitori</Link>
      </PageHeader>

      <Card title="Dati e accesso" className="mb-6">
        <InvestorForm investor={investor} />
      </Card>

      <Card title={`Veicoli assegnati · ${assigned.length}`} className="mb-6">
        {assigned.length === 0 ? (
          <Empty>Nessun veicolo: assegnane uno qui sotto.</Empty>
        ) : (
          <div className="mb-6 overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Veicolo</th><th>ID Atom</th><th>Città</th><th>Periodo di possesso (corse contate)</th><th /></tr>
              </thead>
              <tbody>
                {assigned.map((v) => (
                  <tr key={v.id}>
                    <td className="font-medium">{v.number ?? "—"}</td>
                    <td className="tabular text-ink-2">{v.atomId}</td>
                    <td className="text-ink-2">{v.city ?? "—"}</td>
                    <td>
                      <form action={updateVehiclePeriod} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={v.id} />
                        <span className="text-xs text-ink-3">dal</span>
                        <input type="date" name="fromDay" defaultValue={v.fromDay ?? ""} className="input w-40" />
                        <span className="text-xs text-ink-3">al</span>
                        <input type="date" name="toDay" defaultValue={v.toDay ?? ""} className="input w-40" />
                        <button className="btn-secondary">Salva</button>
                      </form>
                    </td>
                    <td className="text-right">
                      <form action={removeVehicle}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="text-xs text-ink-3 hover:text-critical">Togli</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AssignVehiclesForm investorId={investor.id} />
        <p className="mt-3 text-xs text-ink-3">Date vuote = da sempre / ancora suo. Se un veicolo viene venduto, metti la data di fine: le corse successive non contano più per questo investitore.</p>
      </Card>

      <h2 className="mb-4 mt-10 text-lg font-semibold">Anteprima: cosa vede {investor.name}</h2>
      <InvestorView investor={investor} />

      <form action={deleteInvestor} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={investor.id} />
        <button className="text-xs text-ink-3 hover:text-critical">Elimina investitore e le sue assegnazioni</button>
      </form>
    </>
  );
}
