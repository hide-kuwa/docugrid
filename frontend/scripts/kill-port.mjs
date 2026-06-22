/**
 * Windows / cross-platform: free dev ports before starting Next.js.
 * Usage: node scripts/kill-port.mjs 3000 3001
 */
import { execSync } from "node:child_process";

const ports = process.argv.slice(2).map((p) => Number(p)).filter((n) => n > 0);
if (ports.length === 0) {
  console.log("No ports specified.");
  process.exit(0);
}

const isWin = process.platform === "win32";

for (const port of ports) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes("LISTENING")) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (pid > 0) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
          console.log(`Killed PID ${pid} on port ${port}`);
        } catch {
          /* ignore */
        }
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9`, { stdio: "ignore" });
      console.log(`Freed port ${port}`);
    }
  } catch {
    console.log(`Port ${port}: nothing to kill`);
  }
}
