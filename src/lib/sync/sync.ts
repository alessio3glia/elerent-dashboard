import { eq, max, sql } from "drizzle-orm";
import { AtomClient, atomAccountFromEnv } from "@/lib/atom/client";
import { db, schema } from "@/lib/db";
import { mapCustomer, mapRide, mapVehicle } from "./map";

const { cities, vehicles, vehicleSnapshots, rides, customers, syncRuns } = schema;

function chunks<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const excluded = (col: string) => sql.raw(`excluded.${col}`);

/** Scarica veicoli, corse e clienti da Atom e li salva nel database. */
export async function syncFromAtom(
  options: { fullHistory?: boolean } = {},
  client = new AtomClient(atomAccountFromEnv()),
) {
  const [run] = await db.insert(syncRuns).values({ kind: "atom" }).returning();
  try {
    const areas = await db.select().from(cities).where(eq(cities.active, true));
    const now = new Date();

    // Veicoli: posizione attuale + foto del momento
    const previous = new Map(
      (await db.select({ atomId: vehicles.atomId, cityId: vehicles.cityId }).from(vehicles)).map((v) => [v.atomId, v.cityId]),
    );
    const atomVehicles = await client.vehicles();
    const vehicleRows = atomVehicles.map((v) => mapVehicle(v, areas, previous.get(v.id) ?? null));
    for (const part of chunks(vehicleRows)) {
      await db
        .insert(vehicles)
        .values(part.map((v) => ({ ...v, updatedAt: now })))
        .onConflictDoUpdate({
          target: vehicles.atomId,
          set: {
            cityId: excluded("city_id"),
            number: excluded("number"),
            status: excluded("status"),
            battery: excluded("battery"),
            lat: excluded("lat"),
            lng: excluded("lng"),
            totalRides: excluded("total_rides"),
            lastParkDate: excluded("last_park_date"),
            updatedAt: excluded("updated_at"),
          },
        });
      await db.insert(vehicleSnapshots).values(
        part.map((v) => ({ cityId: v.cityId, takenAt: now, atomId: v.atomId, status: v.status, battery: v.battery, lat: v.lat, lng: v.lng })),
      );
    }

    // Corse: dall'ultima salvata (con un giorno di margine)
    const [{ last }] = await db.select({ last: max(rides.startTime) }).from(rides);
    // Primo avvio o import completo: tutto lo storico disponibile su Atom
    const since = options.fullHistory || !last ? null : new Date(new Date(last).getTime() - 86_400_000);
    const vehicleCity = new Map(vehicleRows.map((v) => [v.atomId, v.cityId]));
    const rideRows = (await client.ridesSince(since, since ? 200 : 1_000_000))
      .map((r) => mapRide(r, vehicleCity, areas))
      .filter((r): r is NonNullable<typeof r> => r !== null && (!since || r.startTime >= since));
    for (const part of chunks(rideRows)) {
      await db
        .insert(rides)
        .values(part)
        .onConflictDoUpdate({
          target: rides.atomId,
          set: { endTime: excluded("end_time"), price: excluded("price"), km: excluded("km"), minutes: excluded("minutes") },
        });
    }
    await db.execute(sql`
      update vehicles v set last_ride_at = r.last
      from (select vehicle_atom_id, max(start_time) as last from rides group by vehicle_atom_id) r
      where r.vehicle_atom_id = v.atom_id`);

    // Clienti
    const customerRows = (await client.customers()).map(mapCustomer);
    for (const part of chunks(customerRows)) {
      await db
        .insert(customers)
        .values(part.map((c) => ({ ...c, updatedAt: now })))
        .onConflictDoUpdate({
          target: customers.atomId,
          set: {
            name: excluded("name"),
            email: excluded("email"),
            phone: excluded("phone"),
            wallet: excluded("wallet"),
            debt: excluded("debt"),
            rides: excluded("rides"),
            blocked: excluded("blocked"),
            updatedAt: excluded("updated_at"),
          },
        });
    }

    const counts = {
      vehicles: vehicleRows.length,
      vehiclesWithoutCity: vehicleRows.filter((v) => v.cityId === null).length,
      rides: rideRows.length,
      customers: customerRows.length,
    };
    await db.update(syncRuns).set({ finishedAt: new Date(), ok: true, counts }).where(eq(syncRuns.id, run.id));
    return counts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(syncRuns).set({ finishedAt: new Date(), ok: false, message }).where(eq(syncRuns.id, run.id));
    throw error;
  }
}
