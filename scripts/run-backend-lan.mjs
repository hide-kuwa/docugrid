import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLanIp } from "./get-lan-ip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const backendDir = path.join(root, "backend");
const ip = getLanIp();

const corsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  `http://${ip}:3000`,
].join(",");

console.log(`[lan-dev] backend on 0.0.0.0:8000 (LAN API http://${ip}:8000)`);

const child = spawn(
  "python",
  ["-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
  {
    cwd: backendDir,
    env: {
      ...process.env,
      DOCUGRID_CORS_ORIGINS: corsOrigins,
    },
    stdio: "inherit",
    shell: true,
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
