// Exercise the packaged server away from workspace node_modules. This catches
// dependencies that work in development but are missing from a deployed bundle.
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";

const tempRoot = resolve(tmpdir());
const isolated = await mkdtemp(join(tempRoot, "fikryon-api-smoke-"));
assert(isolated.startsWith(tempRoot + sep));
await cp(fileURLToPath(new URL("../artifacts/api-server/dist", import.meta.url)), isolated, { recursive: true });
const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const env = { ...process.env, NODE_ENV: "production", NODE_PATH: "", PORT: String(port) };
for (const key of ["DATABASE_URL", "SMTP_USER", "SMTP_PASS", "CRON_SECRET", "MAIL_ENABLED"]) delete env[key];
const child = spawn(process.execPath, [join(isolated, "index.mjs")], { env, cwd: isolated, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", chunk => { output += chunk; });
child.stderr.on("data", chunk => { output += chunk; });
try {
  let health;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Isolated API exited: ${output}`);
    try { health = await fetch(`http://127.0.0.1:${port}/api/healthz`); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(health, `Isolated API did not start: ${output}`);
  assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: "ok" });
  const signup = await fetch(`http://127.0.0.1:${port}/api/subscribe`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "controlled@example.com", lang: "en" }),
  });
  assert.equal(signup.status, 503); assert.deepEqual(await signup.json(), { error: "EMAIL_UNAVAILABLE" });
  console.log("Isolated API bundle: health 200; unconfigured signup 503; no workspace dependencies required.");
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise(resolve => child.once("exit", resolve));
  // Only remove the uniquely generated, verified temporary directory.
  assert(resolve(isolated).startsWith(tempRoot + sep + "fikryon-api-smoke-"));
  await rm(isolated, { recursive: true, force: true });
}
