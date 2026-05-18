# Decisions

## 2026-05-18 Architecture Decisions

- Config storage: TOML on website filesystem at env.CONFIG_PATH
- Auth: SHA-256 hex digest of 32-byte token, constant-time compare
- Daemon assignment: per-tile `daemon` field, defaults to "default"
- Poll model: daemon polls website for jobs + local cron scheduling
- Migration: hard cut (no dual-mode flag)
- daemon_id on all ping tables
- Full test pyramid: unit + integration (ephemeral Postgres) + Playwright e2e
- No web UI for config editing
- No queue/broker — direct HTTP only
- 5s TTL config cache on website
- 401 from website → daemon exits with code 78
- Network error → exponential backoff (base 5s, cap 5min)
