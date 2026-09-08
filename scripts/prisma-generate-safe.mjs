/*
 * `prisma generate` rewrites node_modules/.prisma/client/query_engine-windows.dll.node
 * by renaming a freshly-written temp file over it. On Windows that rename fails
 * with EPERM whenever another process still has the engine DLL open — most
 * commonly a `next dev` left running in another terminal, since it loads the
 * Prisma client on first request and keeps it loaded. Each failed attempt also
 * leaves its temp file behind (query_engine-windows.dll.node.tmp<pid>, ~20MB
 * each), which silently piles up on disk over repeated runs.
 *
 * This is not a real failure: the previously-generated client is untouched and
 * keeps working. Treating it as fatal breaks `npm install` / `npm test` any
 * time a dev server happens to be running elsewhere. So: run `prisma generate`,
 * and if it fails in this specific locked-file way, warn and continue instead
 * of crashing the script chain. Any other failure (schema error, missing
 * binary, ...) still fails the build as normal.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const prismaBin = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
);

const result = spawnSync(prismaBin, ["generate"], {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
  encoding: "utf8",
  // .cmd shims on Windows can't be spawned directly without a shell (EINVAL).
  shell: process.platform === "win32",
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const isWindowsEngineLock =
  process.platform === "win32" &&
  result.status !== 0 &&
  /EPERM/.test(output) &&
  /query_engine-windows\.dll\.node/.test(output);

const clientDir = path.join(root, "node_modules", ".prisma", "client");

if (isWindowsEngineLock) {
  console.warn(
    "\n[prisma-generate-safe] Skipped: another process (likely `next dev`) has the Prisma query engine locked. " +
      "The existing generated client is unaffected and will keep working — stop the dev server and rerun `prisma generate` " +
      "by hand if you actually changed prisma/schema.prisma models.\n"
  );

  // Best-effort cleanup of orphaned temp files from this and past failed attempts.
  if (existsSync(clientDir)) {
    for (const name of readdirSync(clientDir)) {
      if (/\.tmp\d+$/.test(name)) {
        try {
          unlinkSync(path.join(clientDir, name));
        } catch {
          // Still locked or already gone — leave it, not worth failing over.
        }
      }
    }
  }

  process.exit(0);
}

process.exit(result.status ?? 1);
