CREATE TABLE "mon_notification_state" (
	"type" varchar(16) NOT NULL,
	"key" varchar(64) NOT NULL,
	"notified_status" varchar(16),
	"observed_status" varchar(16) NOT NULL,
	"observed_since" timestamp with time zone NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mon_notification_state_type_key_pk" PRIMARY KEY("type","key")
);
