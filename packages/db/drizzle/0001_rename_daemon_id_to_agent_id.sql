ALTER TABLE "mon_container_ping" RENAME COLUMN "daemon_id" TO "agent_id";--> statement-breakpoint
ALTER TABLE "mon_github_check_run" RENAME COLUMN "daemon_id" TO "agent_id";--> statement-breakpoint
ALTER TABLE "mon_github_ping" RENAME COLUMN "daemon_id" TO "agent_id";--> statement-breakpoint
ALTER TABLE "mon_host_ping" RENAME COLUMN "daemon_id" TO "agent_id";--> statement-breakpoint
ALTER TABLE "mon_website_ping" RENAME COLUMN "daemon_id" TO "agent_id";