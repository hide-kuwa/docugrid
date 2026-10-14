import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(path.resolve(__dirname, ".."), "backend");

const child = spawn(
  "python",
  ["-m", "uvicorn", "main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"],
  {
    cwd: backendDir,
    env: {
      ...process.env,
      DOCUGRID_ENV: process.env.DOCUGRID_ENV || "development",
    },
    stdio: "inherit",
    shell: true,
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
