ALTER TABLE "dashboard_updates" ADD COLUMN IF NOT EXISTS "claude_status" text;--> statement-breakpoint
ALTER TABLE "dashboard_updates" ADD COLUMN IF NOT EXISTS "claude_reply" text;--> statement-breakpoint
ALTER TABLE "dashboard_updates" ADD COLUMN IF NOT EXISTS "claude_at" timestamp with time zone;