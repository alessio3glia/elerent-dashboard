// Dati di esempio per vedere la dashboard senza Atom. Uso: npm run seed:demo
// Crea 4 città "Demo" con 60 giorni di corse e 10 giorni di foto della flotta.
import { inArray, like, sql } from "drizzle-orm";
import { closeDb, db, schema } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";
import { computeMetrics } from "@/lib/metrics/compute";
import { generateDailyTasks } from "@/lib/rules/run";

const { cities, vehicles, vehicleSnapshots, rides, customers, dailyMetrics, alerts, tasks } = schema;

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const DEMO = [
  { slug: "demo-nord", name: "Demo Nord", lat: 45.46, lng: 9.19, fleet: 120, rpv: 2.6, trend: 0, battery: 0.05, stuck: 0.1 },
  { slug: "demo-centro", name: "Demo Centro", lat: 41.9, lng: 12.49, fleet: 80, rpv: 2.2, trend: -0.012, battery: 0.08, stuck: 0.15 },
  { slug: "demo-sud", name: "Demo Sud", lat: 40.85, lng: 14.27, fleet: 60, rpv: 1.1, trend: 0.004, battery: 0.3, stuck: 0.7 },
  { slug: "demo-isole", name: "Demo Isole", lat: 38.12, lng: 13.36, fleet: 45, rpv: 1.9, trend: -0.004, battery: 0.1, stuck: 0.2 },
];

// Pulizia delle sole città demo
const old = await db.select({ id: cities.id }).from(cities).where(like(cities.slug, "demo-%"));
if (old.length) {
  const ids = old.map((c) => c.id);
  await db.delete(tasks).where(inArray(tasks.cityId, ids));
  await db.delete(alerts).where(inArray(alerts.cityId, ids));
  await db.delete(dailyMetrics).where(inArray(dailyMetrics.cityId, ids));
  await db.delete(rides).where(inArray(rides.cityId, ids));
  await db.delete(vehicleSnapshots).where(inArray(vehicleSnapshots.cityId, ids));
  await db.delete(vehicles).where(inArray(vehicles.cityId, ids));
  await db.delete(cities).where(inArray(cities.id, ids));
}
await db.delete(customers).where(sql`${customers.atomId} >= 9000000`);

const today = localDay();
const DAYS = 60;
let rideId = 9_000_000;
let customerId = 9_000_000;

for (const [ci, d] of DEMO.entries()) {
  const [city] = await db
    .insert(cities)
    .values({
      slug: d.slug,
      name: d.name,
      affiliateName: `Affiliato ${d.name}`,
      contactName: `Referente ${d.name.split(" ")[1]}`,
      contactPhone: "+39 000 000 0000",
      centerLat: d.lat,
      centerLng: d.lng,
      radiusKm: 15,
      revenueSharePct: 10,
      feePerVehicleMonth: 15,
      lastContactAt: ci === 0 ? new Date() : null,
    })
    .returning();

  const fleet = Array.from({ length: d.fleet }, (_, i) => ({
    atomId: 8_000_000 + ci * 1000 + i,
    lat: d.lat + (rand() - 0.5) * 0.08,
    lng: d.lng + (rand() - 0.5) * 0.1,
  }));
  const users = Array.from({ length: d.fleet * 6 }, () => customerId++);

  const rideRows = [];
  for (let i = DAYS; i >= 1; i--) {
    const day = addDays(today, -i);
    const t = DAYS - i;
    const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()) ? 1.25 : 1;
    const n = Math.max(0, Math.round(d.fleet * d.rpv * weekend * (1 + d.trend * t) * (0.85 + rand() * 0.3)));
    for (let k = 0; k < n; k++) {
      const v = fleet[Math.floor(rand() * fleet.length * (d.stuck > 0.5 ? 0.35 : 0.9))];
      const start = new Date(`${day}T${String(7 + Math.floor(rand() * 15)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}:00+02:00`);
      const minutes = 5 + rand() * 20;
      rideRows.push({
        atomId: rideId++,
        cityId: city.id,
        vehicleAtomId: v.atomId,
        customerAtomId: users[Math.floor(rand() ** 2 * users.length)],
        startTime: start,
        endTime: new Date(start.getTime() + minutes * 60000),
        km: Math.round(minutes * 0.25 * 10) / 10,
        minutes,
        price: Math.round((1 + minutes * 0.22) * 100) / 100,
      });
    }
  }
  for (let i = 0; i < rideRows.length; i += 1000) await db.insert(rides).values(rideRows.slice(i, i + 1000));

  await db.insert(vehicles).values(
    fleet.map((v) => ({ cityId: city.id, atomId: v.atomId, number: `V${v.atomId % 10000}`, status: "AVAILABLE", battery: 60, lat: v.lat, lng: v.lng })),
  );

  // Foto della flotta ogni mattina degli ultimi 10 giorni
  for (let i = 10; i >= 1; i--) {
    const takenAt = new Date(`${addDays(today, -i)}T05:00:00+02:00`);
    await db.insert(vehicleSnapshots).values(
      fleet.map((v, idx) => {
        const moved = rand() > d.stuck;
        if (moved) {
          v.lat += (rand() - 0.5) * 0.01;
          v.lng += (rand() - 0.5) * 0.01;
        }
        const offStreet = ci === 1 && i <= 2 && idx % 4 === 0; // Demo Centro: veicoli tolti dalla strada
        return {
          cityId: city.id,
          takenAt,
          atomId: v.atomId,
          status: offStreet ? "MAINTENANCE" : "AVAILABLE",
          battery: rand() < d.battery ? Math.floor(rand() * 19) : 25 + Math.floor(rand() * 75),
          lat: v.lat,
          lng: v.lng,
        };
      }),
    );
  }
  await db.insert(customers).values(users.map((id) => ({ atomId: id, name: `Cliente ${id}`, registeredAt: new Date() })));
}

await db.execute(sql`
  update vehicles v set last_ride_at = r.last
  from (select vehicle_atom_id, max(start_time) as last from rides group by vehicle_atom_id) r
  where r.vehicle_atom_id = v.atom_id`);

await computeMetrics(addDays(today, -DAYS), addDays(today, -1));
console.log(await generateDailyTasks(today));
await closeDb();
