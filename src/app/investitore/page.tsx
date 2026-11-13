import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { InvestorView } from "@/components/investor-view";
import { PageHeader } from "@/components/ui";
import { requireInvestor } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InvestorPage() {
  const user = await requireInvestor();
  const [investor] = await db.select().from(schema.investors).where(eq(schema.investors.id, user.id));
  // Account rimosso dall'admin dopo il login: torna al login.
  if (!investor) redirect("/login");
  return (
    <>
      <PageHeader title={`Ciao ${investor.name}`} subtitle="Andamento dei tuoi veicoli, aggiornato in tempo reale dai dati della piattaforma." />
      <InvestorView investor={investor} />
    </>
  );
}
