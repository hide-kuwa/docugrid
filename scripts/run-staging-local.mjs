import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const backendDir = path.join(root, "backend");
const frontendDir = path.join(root, "frontend");
const prodEnvPath = path.join(backendDir, ".env.production");
const frontEnvPath = path.join(frontendDir, ".env.production.local");

function loadEnvFile(filePath) {
  const env = { ...process.env };
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key) env[key] = value;
  }
  return env;
}

function runStep(label, command, args, options) {
  return new Promise((resolve, reject) => {
    console.log(`\n[staging] ${label}`);
    const child = spawn(command, args, {
      ...options,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (exit ${code})`));
    });
  });
}

async function main() {
  console.log("[staging] DocuGrid local production-mode stack");
  console.log("[staging] Google OAuth not required (DOCUGRID_STAGING_LOCAL)");
  console.log("[staging] Login: admin@tax.co.jp / password staging\n");

  await runStep("bootstrap .env.production", "python", ["scripts/bootstrap_production.py", "--staging-local"], {
    cwd: backendDir,
    env: process.env,
  });

  const backendEnv = loadEnvFile(prodEnvPath);
  const frontendEnv = loadEnvFile(frontEnvPath);

  if (!fs.existsSync(prodEnvPath)) {
    console.error("Missing backend/.env.production — bootstrap failed.");
    process.exit(1);
  }

  console.log("\n[staging] starting API (production env) on :8000");
  console.log("[staging] starting frontend on :3000");
  console.log("[staging] open http://localhost:3000/login\n");

  const backend = spawn(
    "python",
    ["-m", "uvicorn", "main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"],
    { cwd: backendDir, env: backendEnv, stdio: "inherit", shell: true },
  );

  const frontend = spawn("npm", ["run", "dev"], {
    cwd: frontendDir,
    env: { ...frontendEnv, ...process.env },
    stdio: "inherit",
    shell: true,
  });

  const shutdown = () => {
    backend.kill();
    frontend.kill();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  backend.on("exit", (code) => {
    console.log(`[staging] backend exited (${code})`);
    frontend.kill();
    process.exit(code ?? 1);
  });
  frontend.on("exit", (code) => {
    console.log(`[staging] frontend exited (${code})`);
    backend.kill();
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
