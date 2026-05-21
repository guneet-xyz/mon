CREATE TYPE "public"."gh_check_run_conclusion" AS ENUM('success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required');--> statement-breakpoint
CREATE TYPE "public"."gh_check_run_status" AS ENUM('queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending');--> statement-breakpoint
CREATE TABLE "mon_container_ping" (
	"ping_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text,
	"key" varchar(64) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"error" varchar(256)
);
--> statement-breakpoint
CREATE TABLE "mon_github_check_run" (
	"_id" serial PRIMARY KEY NOT NULL,
	"ping_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text,
	"id" bigint NOT NULL,
	"name" varchar(256) NOT NULL,
	"status" "gh_check_run_status" NOT NULL,
	"conclusion" "gh_check_run_conclusion",
	"details_url" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "mon_github_check_run_ping_id_unique" UNIQUE("ping_id"),
	CONSTRAINT "mon_github_check_run_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "mon_github_ping" (
	"ping_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text,
	"key" varchar(64) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"commit_hash" varchar(40),
	"check_run_id" bigint,
	"error" varchar(256),
	CONSTRAINT "github_ping_valid" CHECK (("mon_github_ping"."commit_hash" IS NOT NULL AND "mon_github_ping"."check_run_id" IS NOT NULL) OR ("mon_github_ping"."error" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "mon_host_ping" (
	"ping_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text,
	"key" varchar(64) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"latency" real,
	"error" varchar(256)
);
--> statement-breakpoint
CREATE TABLE "mon_website_ping" (
	"ping_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text,
	"key" varchar(64) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"latency" real,
	"error" varchar(256)
);
--> statement-breakpoint
ALTER TABLE "mon_github_ping" ADD CONSTRAINT "mon_github_ping_check_run_id_mon_github_check_run_id_fk" FOREIGN KEY ("check_run_id") REFERENCES "public"."mon_github_check_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "containers_key_idx" ON "mon_container_ping" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "github_check_run_id_unique" ON "mon_github_check_run" USING btree ("id");--> statement-breakpoint
CREATE INDEX "github_ping_key_idx" ON "mon_github_ping" USING btree ("key");--> statement-breakpoint
CREATE INDEX "github_ping_commit_hash_idx" ON "mon_github_ping" USING btree ("commit_hash");--> statement-breakpoint
CREATE INDEX "hosts_key_idx" ON "mon_host_ping" USING btree ("key");--> statement-breakpoint
CREATE INDEX "websites_key_idx" ON "mon_website_ping" USING btree ("key");