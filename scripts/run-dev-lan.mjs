/**
 * Start backend + frontend for same-Wi-Fi / LAN access.
 * Other PCs: http://<your-lan-ip>:3000
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLanIp } from "./get-lan-ip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const backendDir = path.join(root, "backend");
const frontendDir = path.join(root, "frontend");

let ip;
try {
  ip = getLanIp();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const corsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  `http://${ip}:3000`,
].join(",");

console.log("");
console.log("DocuGrid — 社内 LAN 開発モード");
console.log("================================");
console.log(`この PC:       http://localhost:3000`);
console.log(`同じ Wi-Fi:   http://${ip}:3000`);
console.log(`API:          http://${ip}:8000/api`);
console.log("");
console.log("ログイン例: admin@taxx.jp / password");
console.log("");
console.log("※ 他の PC から繋がらない場合は Windows ファイアウォールで");
console.log("  TCP 3000 / 8000 を許可してください（管理者 PowerShell）:");
console.log('  npm run dev:lan:firewall');
console.log("");

const children = [];

function spawnChild(label, command, args, options) {
  const child = spawn(command, args, {
    shell: true,
    stdio: "inherit",
    ...options,
  });
  child.on("error", (err) => {
    console.error(`[lan-dev] ${label} failed:`, err.message);
    shutdown(1);
  });
  children.push({ label, child });
  return child;
}

function shutdown(code = 0) {
  for (const { label, child } of children) {
    if (!child.killed) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { shell: true });
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        console.error(`[lan-dev] could not stop ${label}`);
      }
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => {
  console.log("\n[lan-dev] stopping...");
  shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));

spawnChild(
  "backend",
  "python",
  ["-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
  {
    cwd: backendDir,
    env: {
      ...process.env,
      DOCUGRID_ENV: process.env.DOCUGRID_ENV || "development",
      DOCUGRID_CORS_ORIGINS: corsOrigins,
    },
  },
);

// Give uvicorn a moment before Next compiles.
setTimeout(() => {
  spawnChild(
    "frontend",
    "npx",
    ["next", "dev", "-H", "0.0.0.0", "-p", "3000"],
    {
      cwd: frontendDir,
      env: {
        ...process.env,
        // api.ts falls back to window.location.hostname:8000 when unset.
        NEXT_PUBLIC_API_BASE: "",
      },
    },
  );
}, 1500);
