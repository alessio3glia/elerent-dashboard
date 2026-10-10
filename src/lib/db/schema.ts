import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Una città / affiliato gestito su Atom. */
export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  affiliateName: text("affiliate_name"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  /** Area della città: veicoli e corse entro questo raggio dal centro sono assegnati qui. */
  centerLat: doublePrecision("center_lat"),
  centerLng: doublePrecision("center_lng"),
  radiusKm: doublePrecision("radius_km").notNull().default(15),
  /** Percentuale Elerent sul fatturato, es. 10 = 10%. */
  revenueSharePct: doublePrecision("revenue_share_pct").notNull().default(10),
  /** Fee Elerent al mese per veicolo pagante (almeno una corsa nel mese di calendario), in euro. */
  feePerVehicleMonth: doublePrecision("fee_per_vehicle_month").notNull().default(15),
  active: boolean("active").notNull().default(true),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vehicles = pgTable(
  "vehicles",
  {
    id: serial("id").primaryKey(),
    cityId: integer("city_id").references(() => cities.id),
    atomId: integer("atom_id").notNull().unique(),
    number: text("number"),
    model: text("model"),
    status: text("status"),
    battery: integer("battery"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    totalRides: integer("total_rides"),
    lastParkDate: timestamp("last_park_date", { withTimezone: true }),
    lastRideAt: timestamp("last_ride_at", { withTimezone: true }),
    /** Ultimo segnale ricevuto dal veicolo (campo Atom se c'è, altrimenti ultimo spostamento o ultima corsa). */
    lastSignalAt: timestamp("last_signal_at", { withTimezone: true }),
    /** Ultima volta che la posizione è cambiata tra due sincronizzazioni: serve per la mappa live. */
    movedAt: timestamp("moved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vehicles_city").on(t.cityId)],
);

/** Foto giornaliera della flotta: serve per trend, mappa e controllo riposizionamento. */
export const vehicleSnapshots = pgTable(
  "vehicle_snapshots",
  {
    id: serial("id").primaryKey(),
    cityId: integer("city_id").references(() => cities.id),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    atomId: integer("atom_id").notNull(),
    status: text("status"),
    battery: integer("battery"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
  },
  (t) => [index("snapshots_city_time").on(t.cityId, t.takenAt)],
);

export const rides = pgTable(
  "rides",
  {
    id: serial("id").primaryKey(),
    cityId: integer("city_id").references(() => cities.id),
    atomId: integer("atom_id").notNull().unique(),
    vehicleAtomId: integer("vehicle_atom_id"),
    customerAtomId: integer("customer_atom_id"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }),
    km: doublePrecision("km"),
    minutes: doublePrecision("minutes"),
    price: doublePrecision("price").notNull().default(0),
    chargedBalance: doublePrecision("charged_balance"),
    chargedBonus: doublePrecision("charged_bonus"),
    withSubscription: boolean("with_subscription"),
    /** Punto di arrivo: serve per la mappa live e per le mappe della domanda. */
    endLat: doublePrecision("end_lat"),
    endLng: doublePrecision("end_lng"),
  },
  (t) => [
    index("rides_city_start").on(t.cityId, t.startTime),
    index("rides_start").on(t.startTime),
    index("rides_customer").on(t.customerAtomId),
  ],
);

/** Clienti finali dello sharing (utenti dell'app), comuni a tutte le città. */
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    atomId: integer("atom_id").notNull().unique(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    registeredAt: timestamp("registered_at", { withTimezone: true }),
    wallet: doublePrecision("wallet"),
    debt: doublePrecision("debt"),
    rides: integer("rides"),
    blocked: boolean("blocked"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customers_registered").on(t.registeredAt)],
);

/** Abbonamenti acquistati dagli utenti (storico acquisti Atom), assegnati alla città dove sono stati comprati. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    atomId: text("atom_id").notNull().unique(),
    cityId: integer("city_id").references(() => cities.id),
    customerAtomId: integer("customer_atom_id"),
    name: text("name"),
    price: doublePrecision("price"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status"),
    /** Città o zona scritta da Atom sull'acquisto, se c'è. */
    place: text("place"),
    /** Campi originali (senza dati personali), per rileggerli se Atom cambia formato. */
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_purchased").on(t.purchasedAt), index("subscriptions_city").on(t.cityId, t.purchasedAt)],
);

/** KPI giornalieri per città, calcolati dai dati sincronizzati. */
export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    cityId: integer("city_id").notNull().references(() => cities.id),
    day: date("day").notNull(),
    /** true quando la flotta è stimata dalle corse (giorni prima della prima foto). */
    estimated: boolean("estimated").notNull().default(false),
    rides: integer("rides").notNull().default(0),
    revenue: doublePrecision("revenue").notNull().default(0),
    fleetSize: integer("fleet_size").notNull().default(0),
    /** Veicoli in strada (stato operativo) nella foto del giorno. */
    activeVehicles: integer("active_vehicles").notNull().default(0),
    vehiclesWithRide: integer("vehicles_with_ride").notNull().default(0),
    /** Veicoli paganti: almeno una corsa dal primo del mese a quel giorno (base della fee). */
    feeVehicles: integer("fee_vehicles").notNull().default(0),
    idleVehicles: integer("idle_vehicles").notNull().default(0),
    lowBattery: integer("low_battery").notNull().default(0),
    /** Veicoli in strada rimasti nello stesso punto rispetto alla foto precedente. */
    stationaryVehicles: integer("stationary_vehicles").notNull().default(0),
    uniqueCustomers: integer("unique_customers").notNull().default(0),
    newCustomers: integer("new_customers").notNull().default(0),
    elerentRevenue: doublePrecision("elerent_revenue").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.cityId, t.day] })],
);

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    cityId: integer("city_id").notNull().references(() => cities.id),
    day: date("day").notNull(),
    rule: text("rule").notNull(),
    severity: text("severity").notNull(), // critical | warning | info
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alerts_city_day_rule").on(t.cityId, t.day, t.rule)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    cityId: integer("city_id").notNull().references(() => cities.id),
    alertId: integer("alert_id").references(() => alerts.id),
    day: date("day").notNull(),
    rule: text("rule").notNull(),
    kind: text("kind").notNull(), // chiamata | verifica | ottimizzazione
    priority: integer("priority").notNull(), // 1 alta, 2 media, 3 bassa
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    action: text("action").notNull(),
    status: text("status").notNull().default("aperta"), // aperta | fatta | saltata
    note: text("note"),
    completedBy: text("completed_by"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tasks_city_day_rule").on(t.cityId, t.day, t.rule)],
);

/** Utenti della dashboard (dipendenti Elerent). */
export const appUsers = pgTable("app_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("operatore"), // admin | operatore
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  message: text("message"),
  counts: jsonb("counts"),
});

export type City = typeof cities.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Alert = typeof alerts.$inferSelect;

/** Stato persistente dei job lunghi (es. import dello storico a blocchi). */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Notifiche push inviate dalla dashboard tramite OneSignal (prove e invii reali). */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    segment: text("segment").notNull(),
    cityId: integer("city_id").references(() => cities.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    test: boolean("test").notNull().default(false),
    status: text("status").notNull(), // in_invio | inviata | errore
    recipients: integer("recipients").notNull().default(0),
    onesignalIds: jsonb("onesignal_ids"),
    error: text("error"),
    sentBy: text("sent_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_created").on(t.createdAt)],
);
