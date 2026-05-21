# test/

Manual end-to-end test stack. Spins up postgres + migrator + website + agent
locally via docker compose.

## Run

From the **repo root**:

```bash
mkdir -p test/data/config
cp test/config.toml.example test/data/config/config.toml
docker compose -f test/compose.yml up --build
```

- Website: http://localhost:3000
- Postgres: `postgres://mon:mon@localhost:5432/mon`

Stop & wipe:

```bash
docker compose -f test/compose.yml down
docker run --rm -v "$(pwd)/test/data:/d" alpine rm -rf /d/postgres /d/config/config.toml
```

(`docker run` is needed because Postgres chowns its data dir to its own uid.)

## Layout

```
test/
├── compose.yml                                 # the stack
├── config.toml.example                         # starter — copy into data/config/
├── data/                                       # gitignored — bind mounts live here
│   ├── postgres/                               # Postgres data dir (root-owned)
│   └── config/                                 # mounted at /etc/mon
│       └── config.toml                         # active tile config
└── README.md
```

## Agent token

`compose.yml` ships a dev `AGENT_TOKEN`. Its sha256 must equal
`agents.default.token_hash` in `test/data/config/config.toml`. To rotate:

```bash
TOKEN=$(openssl rand -hex 32)
echo "AGENT_TOKEN=$TOKEN"
echo -n "$TOKEN" | sha256sum   # paste into config.toml
```
