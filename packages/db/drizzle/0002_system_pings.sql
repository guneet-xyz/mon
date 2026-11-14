CREATE TABLE "mon_system_ping" (
	"ping_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text,
	"key" varchar(64) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"error" varchar(256),
	"cpu_percent" real,
	"memory_bytes" bigint,
	"memory_total_bytes" bigint,
	"uptime_seconds" integer,
	"disks" jsonb
);
--> statement-breakpoint
CREATE INDEX "system_pings_key_idx" ON "mon_system_ping" USING btree ("key");