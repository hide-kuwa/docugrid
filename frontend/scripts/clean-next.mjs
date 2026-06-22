/**
 * OneDrive 配下の `.next` は symlink が壊れ、Node の rm や Next の削除で EINVAL になることがある。
 * Windows では `rd /s /q` の方が通りやすい。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const nextDir = path.join(process.cwd(), ".next");

if (!fs.existsSync(nextDir)) {
  console.log("No .next folder to remove.");
  process.exit(0);
}

if (process.platform === "win32") {
  const result = spawnSync("cmd", ["/c", "rd", "/s", "/q", nextDir], {
    stdio: "inherit",
    shell: false,
  });
  process.exit(result.status ?? 1);
}

fs.rmSync(nextDir, { recursive: true, force: true });
console.log("Removed .next");
