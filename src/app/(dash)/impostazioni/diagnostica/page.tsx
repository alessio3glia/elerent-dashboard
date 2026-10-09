import { Card, PageHeader } from "@/components/ui";
import { diagnoseAtom } from "@/lib/atom/diagnose";
import { requireAdmin } from "@/lib/auth/session";

export const maxDuration = 60;

export default async function DiagnosticsPage() {
  await requireAdmin();
  let report: unknown;
  try {
    report = await diagnoseAtom();
  } catch (e) {
    report = { errore: e instanceof Error ? e.message : String(e) };
  }
  return (
    <>
      <PageHeader
        title="Diagnostica Atom"
        subtitle="Prova di collegamento in sola lettura: formati dei dati, ordine delle corse e stati dei veicoli. I dati personali sono oscurati."
      />
      <Card>
        <pre className="overflow-x-auto text-xs leading-relaxed text-ink-2">{JSON.stringify(report, null, 2)}</pre>
      </Card>
    </>
  );
}
