import { exec as _exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";
import { spinner } from "@clack/prompts";

const exec = promisify(_exec);

async function findRepoRoot(): Promise<string> {
  // Prefer git for accuracy; fall back to walking up from cwd looking for prisma/schema.prisma.
  try {
    const { stdout } = await exec("git rev-parse --show-toplevel");
    const root = stdout.trim();
    if (root && existsSync(join(root, "prisma", "schema.prisma"))) return root;
  } catch {
    // not in a git repo, or git not installed
  }

  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "prisma", "schema.prisma"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    "Could not locate prisma/schema.prisma. Run this from inside your trustclaw clone.",
  );
}

export async function runMigration(databaseUrl: string): Promise<void> {
  const s = spinner();
  s.start("Running database migration (prisma db push)");

  try {
    const repoRoot = await findRepoRoot();
    await exec("pnpm prisma db push --accept-data-loss", {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    s.stop("Schema applied");
  } catch (err) {
    s.stop("Migration failed");
    throw err;
  }
}
