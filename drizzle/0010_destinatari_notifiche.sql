CREATE TABLE "notification_recipients" (
	"notification_id" integer NOT NULL,
	"customer_atom_id" integer NOT NULL,
	CONSTRAINT "notification_recipients_notification_id_customer_atom_id_pk" PRIMARY KEY("notification_id","customer_atom_id")
);
--> statement-breakpoint
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;