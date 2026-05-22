"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.ts
var index_exports = {};
__export(index_exports, {
  createMockGithubServer: () => createMockGithubServer,
  createMockHttpHost: () => createMockHttpHost,
  createTestDb: () => createTestDb,
  fixturePath: () => fixturePath,
  withTestDb: () => withTestDb
});
module.exports = __toCommonJS(index_exports);

// ../db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  containerPings: () => containerPings,
  createTable: () => createTable,
  ghCheckRunConclusionEnum: () => ghCheckRunConclusionEnum,
  ghCheckRunStatusEnum: () => ghCheckRunStatusEnum,
  githubCheckRun: () => githubCheckRun,
  githubPings: () => githubPings,
  hostPings: () => hostPings,
  websitePings: () => websitePings
});
var import_drizzle_orm = require("drizzle-orm");
var import_pg_core = require("drizzle-orm/pg-core");
var createTable = (0, import_pg_core.pgTableCreator)((name) => `mon_${name}`);
var hostPings = createTable(
  "host_ping",
  {
    pingId: (0, import_pg_core.uuid)("ping_id").primaryKey().defaultRandom(),
    agentId: (0, import_pg_core.text)("agent_id"),
    key: (0, import_pg_core.varchar)("key", { length: 64 }).notNull(),
    timestamp: (0, import_pg_core.timestamp)("timestamp", {
      mode: "date",
      withTimezone: true
    }).notNull(),
    latency: (0, import_pg_core.real)("latency"),
    error: (0, import_pg_core.varchar)("error", { length: 256 })
  },
  (t) => [(0, import_pg_core.index)("hosts_key_idx").on(t.key)]
);
var websitePings = createTable(
  "website_ping",
  {
    pingId: (0, import_pg_core.uuid)("ping_id").primaryKey().defaultRandom(),
    agentId: (0, import_pg_core.text)("agent_id"),
    key: (0, import_pg_core.varchar)("key", { length: 64 }).notNull(),
    timestamp: (0, import_pg_core.timestamp)("timestamp", {
      mode: "date",
      withTimezone: true
    }).notNull(),
    latency: (0, import_pg_core.real)("latency"),
    error: (0, import_pg_core.varchar)("error", { length: 256 })
  },
  (t) => [(0, import_pg_core.index)("websites_key_idx").on(t.key)]
);
var containerPings = createTable(
  "container_ping",
  {
    pingId: (0, import_pg_core.uuid)("ping_id").primaryKey().defaultRandom(),
    agentId: (0, import_pg_core.text)("agent_id"),
    key: (0, import_pg_core.varchar)("key", { length: 64 }).notNull(),
    timestamp: (0, import_pg_core.timestamp)("timestamp", {
      mode: "date",
      withTimezone: true
    }).notNull(),
    error: (0, import_pg_core.varchar)("error", { length: 256 })
  },
  (t) => [(0, import_pg_core.index)("containers_key_idx").on(t.key)]
);
var ghCheckRunStatusEnum = (0, import_pg_core.pgEnum)("gh_check_run_status", [
  "queued",
  "in_progress",
  "completed",
  "waiting",
  "requested",
  "pending"
]);
var ghCheckRunConclusionEnum = (0, import_pg_core.pgEnum)("gh_check_run_conclusion", [
  "success",
  "failure",
  "neutral",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required"
]);
var githubCheckRun = createTable(
  "github_check_run",
  {
    _id: (0, import_pg_core.serial)("_id").primaryKey(),
    pingId: (0, import_pg_core.uuid)("ping_id").notNull().unique().defaultRandom(),
    agentId: (0, import_pg_core.text)("agent_id"),
    id: (0, import_pg_core.bigint)("id", { mode: "number" }).notNull().unique(),
    name: (0, import_pg_core.varchar)("name", { length: 256 }).notNull(),
    status: ghCheckRunStatusEnum().notNull(),
    conclusion: ghCheckRunConclusionEnum(),
    detailsUrl: (0, import_pg_core.text)("details_url"),
    startedAt: (0, import_pg_core.timestamp)("started_at", {
      mode: "date",
      withTimezone: true
    }),
    completedAt: (0, import_pg_core.timestamp)("completed_at", {
      mode: "date",
      withTimezone: true
    })
  },
  (t) => [(0, import_pg_core.uniqueIndex)("github_check_run_id_unique").on(t.id)]
);
var githubPings = createTable(
  "github_ping",
  {
    pingId: (0, import_pg_core.uuid)("ping_id").primaryKey().defaultRandom(),
    agentId: (0, import_pg_core.text)("agent_id"),
    key: (0, import_pg_core.varchar)("key", { length: 64 }).notNull(),
    timestamp: (0, import_pg_core.timestamp)("timestamp", {
      mode: "date",
      withTimezone: true
    }).notNull(),
    commitHash: (0, import_pg_core.varchar)("commit_hash", { length: 40 }),
    checkRunId: (0, import_pg_core.bigint)("check_run_id", { mode: "number" }).references(
      () => githubCheckRun.id
    ),
    error: (0, import_pg_core.varchar)("error", { length: 256 })
  },
  (t) => [
    (0, import_pg_core.index)("github_ping_key_idx").on(t.key),
    (0, import_pg_core.index)("github_ping_commit_hash_idx").on(t.commitHash),
    (0, import_pg_core.check)(
      "github_ping_valid",
      import_drizzle_orm.sql`(${t.commitHash} IS NOT NULL AND ${t.checkRunId} IS NOT NULL) OR (${t.error} IS NOT NULL)`
    )
  ]
);

// index.ts
var import_child_process = require("child_process");
var import_postgres_js = require("drizzle-orm/postgres-js");
var import_http = __toESM(require("http"));
var import_net = __toESM(require("net"));
var import_path2 = __toESM(require("path"));
var import_postgres = __toESM(require("postgres"));
var import_url2 = require("url");

// fixtures/index.ts
var import_path = require("path");
var import_url = require("url");
var import_meta = {};
function fixturePath(name) {
  const here = (0, import_path.dirname)((0, import_url.fileURLToPath)(import_meta.url));
  return (0, import_path.join)(here, name);
}

// index.ts
var import_meta2 = {};
var activeContainers = /* @__PURE__ */ new Set();
var activeServers = /* @__PURE__ */ new Set();
var exitHandlersRegistered = false;
function registerExitHandlers() {
  if (exitHandlersRegistered) return;
  exitHandlersRegistered = true;
  const cleanup = () => {
    for (const name of activeContainers) {
      try {
        (0, import_child_process.execSync)(`docker rm -f ${name}`, { stdio: "pipe" });
      } catch {
      }
    }
    activeContainers.clear();
    for (const server of activeServers) {
      try {
        void server.stop();
      } catch {
      }
    }
    activeServers.clear();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
  process.on("uncaughtException", (err) => {
    cleanup();
    throw err;
  });
}
async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = import_net.default.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("could not determine port")));
      }
    });
  });
}
async function waitForPostgres(url, timeoutMs) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const client = (0, import_postgres.default)(url, {
        max: 1,
        connect_timeout: 2,
        onnotice: () => {
        }
      });
      await client`SELECT 1`;
      await client.end();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(
    `Postgres at ${url} not ready after ${timeoutMs}ms: ${String(lastError)}`
  );
}
function applySchema(url) {
  const here = import_path2.default.dirname((0, import_url2.fileURLToPath)(import_meta2.url));
  const dbPackage = import_path2.default.resolve(here, "..", "db");
  (0, import_child_process.execSync)(`bunx drizzle-kit push --force`, {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe"
  });
}
async function createTestDb() {
  registerExitHandlers();
  const port = await getFreePort();
  const containerName = `mon-test-${port}-${Math.random().toString(36).slice(2, 8)}`;
  (0, import_child_process.execSync)(
    `docker run -d --rm --name ${containerName} -e POSTGRES_PASSWORD=test -e POSTGRES_DB=mon_test -p ${port}:5432 postgres:16`,
    { stdio: "pipe" }
  );
  activeContainers.add(containerName);
  const url = `postgres://postgres:test@localhost:${port}/mon_test`;
  try {
    await waitForPostgres(url, 3e4);
    applySchema(url);
  } catch (err) {
    try {
      (0, import_child_process.execSync)(`docker rm -f ${containerName}`, { stdio: "pipe" });
    } catch {
    }
    activeContainers.delete(containerName);
    throw err;
  }
  const client = (0, import_postgres.default)(url, { onnotice: () => {
  } });
  const db = (0, import_postgres_js.drizzle)(client, { schema: schema_exports });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      void client.end({ timeout: 2 });
    } catch {
    }
    try {
      (0, import_child_process.execSync)(`docker rm -f ${containerName}`, { stdio: "pipe" });
    } catch {
    }
    activeContainers.delete(containerName);
  };
  return { db, url, stop };
}
async function withTestDb(fn) {
  const testDb = await createTestDb();
  try {
    return await fn(testDb.db, testDb.url);
  } finally {
    testDb.stop();
  }
}
async function createMockHttpHost(opts) {
  registerExitHandlers();
  const port = opts?.port ?? await getFreePort();
  const requests = [];
  let scenario = { kind: "ok", status: 200 };
  const sockets = /* @__PURE__ */ new Set();
  const tcpServer = import_net.default.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {
      sockets.delete(socket);
    });
    let buf = "";
    socket.on("data", async (chunk) => {
      buf += chunk.toString("utf8");
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const head = buf.slice(0, headerEnd);
      const requestLine = head.split("\r\n")[0] ?? "";
      const [method = "GET", rawPath = "/"] = requestLine.split(" ");
      requests.push({ method, path: rawPath });
      const current = scenario;
      buf = "";
      if (current.kind === "no_response") {
        return;
      }
      if (current.kind === "tcp_reset") {
        try {
          socket.resetAndDestroy();
        } catch {
          socket.destroy();
        }
        return;
      }
      if (current.kind === "slow") {
        await new Promise((r) => setTimeout(r, current.delayMs));
        if (socket.destroyed) return;
        writeHttpResponse(socket, 200, { "content-length": "2" }, "ok");
        return;
      }
      if (current.kind === "redirect") {
        writeHttpResponse(
          socket,
          current.status,
          {
            location: current.location,
            "content-length": "0"
          },
          ""
        );
        return;
      }
      if (current.kind === "server_error") {
        const body2 = `error ${current.status}`;
        writeHttpResponse(
          socket,
          current.status,
          { "content-length": String(Buffer.byteLength(body2)) },
          method === "HEAD" ? "" : body2
        );
        return;
      }
      const body = current.body ?? "ok";
      writeHttpResponse(
        socket,
        current.status,
        { "content-length": String(Buffer.byteLength(body)) },
        method === "HEAD" ? "" : body
      );
    });
  });
  await new Promise((resolve, reject) => {
    tcpServer.once("error", reject);
    tcpServer.listen(port, "127.0.0.1", () => resolve());
  });
  let stopped = false;
  const handle = {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      for (const s of sockets) {
        try {
          s.destroy();
        } catch {
        }
      }
      sockets.clear();
      await new Promise((resolve) => {
        tcpServer.close(() => resolve());
      });
      activeServers.delete(handle);
    }
  };
  activeServers.add(handle);
  return {
    url: `http://127.0.0.1:${port}`,
    setScenario(s) {
      scenario = s;
    },
    requests,
    stop: handle.stop
  };
}
function writeHttpResponse(socket, status, headers, body) {
  const statusText = HTTP_STATUS_TEXT[status] ?? "OK";
  const headerLines = Object.entries({
    connection: "close",
    ...headers
  }).map(([k, v]) => `${k}: ${v}`).join("\r\n");
  const payload = `HTTP/1.1 ${status} ${statusText}\r
${headerLines}\r
\r
${body}`;
  try {
    socket.write(payload, () => {
      socket.end();
    });
  } catch {
  }
}
var HTTP_STATUS_TEXT = {
  200: "OK",
  301: "Moved Permanently",
  302: "Found",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable"
};
async function createMockGithubServer(opts) {
  registerExitHandlers();
  const port = opts?.port ?? await getFreePort();
  const requests = [];
  let scenario = { kind: "empty" };
  const server = import_http.default.createServer((req, res) => {
    const reqUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(",");
    }
    requests.push({
      method: req.method ?? "GET",
      path: reqUrl.pathname,
      headers
    });
    const match = reqUrl.pathname.match(
      /^\/repos\/[^/]+\/[^/]+\/commits\/HEAD\/check-runs$/
    );
    if (!match || req.method !== "GET") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not Found");
      return;
    }
    const current = scenario;
    switch (current.kind) {
      case "success": {
        const body = JSON.stringify({ check_runs: current.checkRuns });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(body);
        return;
      }
      case "empty": {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ check_runs: [] }));
        return;
      }
      case "http_error": {
        res.writeHead(current.status, { "content-type": "text/plain" });
        res.end(`error ${current.status}`);
        return;
      }
      case "slow": {
        setTimeout(() => {
          if (res.writableEnded) return;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ check_runs: [] }));
        }, current.delayMs);
        return;
      }
      case "malformed": {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("not json {{{");
        return;
      }
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  let stopped = false;
  const entry = {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
      activeServers.delete(entry);
    }
  };
  activeServers.add(entry);
  return {
    url: `http://localhost:${port}`,
    setScenario(s) {
      scenario = s;
    },
    requests,
    stop: entry.stop
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createMockGithubServer,
  createMockHttpHost,
  createTestDb,
  fixturePath,
  withTestDb
});
