ALTER TABLE "mon_container_ping" ADD COLUMN "state" varchar(16);--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "health" varchar(16);--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "restart_count" integer;--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "exit_code" integer;--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "oom_killed" boolean;--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "image" varchar(256);--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "image_version" varchar(64);--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "cpu_percent" real;--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "memory_bytes" bigint;--> statement-breakpoint
ALTER TABLE "mon_container_ping" ADD COLUMN "memory_limit_bytes" bigint;--> statement-breakpoint
ALTER TABLE "mon_website_ping" ADD COLUMN "status_code" smallint;--> statement-breakpoint
ALTER TABLE "mon_website_ping" ADD COLUMN "redirect_location" varchar(512);--> statement-breakpoint
ALTER TABLE "mon_website_ping" ADD COLUMN "cert_expires_at" timestamp with time zone;