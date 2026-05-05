import { exec as _exec, spawn } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { confirm, isCancel, log, spinner } from "@clack/prompts";

const exec = promisify(_exec);

async function runInteractive(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export interface AuthResult {
  vercelToken: string;
  vercelTeamId: string | null;
  vercelOwnerSlug: string;
  vercelBillingPlan: string; // "hobby" | "pro" | "enterprise" | etc.
  githubToken: string;
  githubUsername: string;
}

async function readVercelTokenFromDisk(): Promise<string | null> {
  const home = homedir();
  const candidates =
    process.platform === "darwin"
      ? [
          join(home, "Library", "Application Support", "com.vercel.cli", "auth.json"),
          join(home, ".local", "share", "com.vercel.cli", "auth.json"),
        ]
      : [
          join(home, ".local", "share", "com.vercel.cli", "auth.json"),
          join(home, "Library", "Application Support", "com.vercel.cli", "auth.json"),
        ];

  for (const authPath of candidates) {
    try {
      const raw = await readFile(authPath, "utf-8");
      const parsed = JSON.parse(raw) as { token: string };
      if (parsed.token) return parsed.token;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function promptVercelLogin(reason: string): Promise<void> {
  log.warn(reason);
  const proceed = await confirm({
    message: "Run `vercel login` now?",
    initialValue: true,
  });
  if (isCancel(proceed) || !proceed) {
    throw new Error("Cancelled. Run `pnpm dlx vercel login` and re-run cli:deploy.");
  }
  const code = await runInteractive("pnpm", ["dlx", "vercel", "login"]);
  if (code !== 0) {
    throw new Error(`vercel login exited with code ${code}.`);
  }
}

async function getVercelToken(): Promise<string> {
  let token = await readVercelTokenFromDisk();
  if (!token) {
    await promptVercelLogin("No Vercel auth found on this machine.");
    token = await readVercelTokenFromDisk();
    if (!token) {
      throw new Error("Still no Vercel auth after login. Try again.");
    }
  }
  return token;
}

async function ghIsInstalled(): Promise<boolean> {
  try {
    await exec("command -v gh");
    return true;
  } catch {
    return false;
  }
}

async function tryReadGhAuth(): Promise<{ token: string; username: string } | null> {
  try {
    const { stdout: token } = await exec("gh auth token");
    const { stdout: userJson } = await exec("gh api user --jq '.login'");
    const trimmedToken = token.trim();
    const trimmedUser = userJson.trim();
    if (!trimmedToken || !trimmedUser) return null;
    return { token: trimmedToken, username: trimmedUser };
  } catch {
    return null;
  }
}

async function promptGhLogin(reason: string): Promise<void> {
  log.warn(reason);
  const proceed = await confirm({
    message: "Run `gh auth login` now?",
    initialValue: true,
  });
  if (isCancel(proceed) || !proceed) {
    throw new Error("Cancelled. Run `gh auth login` and re-run cli:deploy.");
  }
  const code = await runInteractive("gh", ["auth", "login"]);
  if (code !== 0) {
    throw new Error(`gh auth login exited with code ${code}.`);
  }
}

async function getGitHubToken(): Promise<{ token: string; username: string }> {
  if (!(await ghIsInstalled())) {
    const installCmd =
      process.platform === "darwin"
        ? "brew install gh"
        : process.platform === "linux"
          ? "see https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
          : "see https://cli.github.com/";
    throw new Error(
      `GitHub CLI (\`gh\`) is not installed. Install it (${installCmd}), then re-run cli:deploy.`,
    );
  }

  let auth = await tryReadGhAuth();
  if (!auth) {
    await promptGhLogin("`gh` is installed but not authenticated.");
    auth = await tryReadGhAuth();
    if (!auth) {
      throw new Error("Still no GitHub auth after login. Try again.");
    }
  }
  return auth;
}

export async function detectAuth(): Promise<AuthResult> {
  const s = spinner();
  s.start("Detecting authentication");

  let vercelToken: string;
  let githubToken: string;
  let githubUsername: string;
  try {
    vercelToken = await getVercelToken();
    const gh = await getGitHubToken();
    githubToken = gh.token;
    githubUsername = gh.username;
  } catch (err) {
    s.stop("Authentication detection failed");
    throw err;
  }

  // If the cached Vercel token is stale (revoked / expired), prompt to log
  // in again and retry once with the fresh token.
  let userRes = await fetch("https://api.vercel.com/v2/user", {
    headers: { Authorization: `Bearer ${vercelToken}` },
  });
  if (userRes.status === 401 || userRes.status === 403) {
    s.stop("Vercel token expired or invalid");
    await promptVercelLogin(
      `Vercel returned ${userRes.status} - your saved token is likely expired or revoked.`,
    );
    const refreshed = await readVercelTokenFromDisk();
    if (!refreshed) {
      throw new Error("No Vercel auth after login. Try again.");
    }
    vercelToken = refreshed;
    s.start("Detecting authentication");
    userRes = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
  }
  if (!userRes.ok) {
    s.stop("Vercel token invalid");
    throw new Error(`Vercel token invalid: ${userRes.status}`);
  }
  const userData = (await userRes.json()) as {
    user: {
      email: string;
      username: string;
      defaultTeamId?: string;
      billing?: { plan?: string };
    };
  };

  const teamId = userData.user.defaultTeamId ?? null;

  // The dashboard URL is scoped by team slug (or username for personal accounts).
  // Personal/Hobby accounts have a default team like "<username>-projects".
  let ownerSlug = userData.user.username;
  // Team billing plan takes precedence when deploying to a team scope.
  let billingPlan = userData.user.billing?.plan ?? "hobby";
  if (teamId) {
    try {
      const teamRes = await fetch(`https://api.vercel.com/v2/teams/${teamId}`, {
        headers: { Authorization: `Bearer ${vercelToken}` },
      });
      if (teamRes.ok) {
        const teamData = (await teamRes.json()) as {
          slug?: string;
          billing?: { plan?: string };
        };
        if (teamData.slug) ownerSlug = teamData.slug;
        if (teamData.billing?.plan) billingPlan = teamData.billing.plan;
      }
    } catch {
      // fall back to user-level fields
    }
  }

  s.stop(`Authenticated as ${userData.user.email} (${billingPlan} plan)`);
  log.success(`GitHub: ${githubUsername}`);

  return {
    vercelToken,
    vercelTeamId: teamId,
    vercelOwnerSlug: ownerSlug,
    vercelBillingPlan: billingPlan,
    githubToken,
    githubUsername,
  };
}
