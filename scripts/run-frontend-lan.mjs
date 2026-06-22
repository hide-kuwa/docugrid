import { spawnSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLanIp } from "./get-lan-ip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const frontendDir = path.join(root, "frontend");
const ip = getLanIp();

console.log(`[lan-dev] frontend on 0.0.0.0:3000`);
console.log(`[lan-dev] open http://${ip}:3000 from other PCs on the same Wi-Fi`);

spawnSync("node", ["scripts/copy-pdfjs-assets.mjs"], {
  cwd: frontendDir,
  stdio: "inherit",
  shell: true,
});

const child = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", "3000"], {
  cwd: frontendDir,
  env: {
    ...process.env,
    NEXT_PUBLIC_API_BASE: `http://${ip}:8000/api`,
  },
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
