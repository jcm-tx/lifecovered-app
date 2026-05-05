import { spinner, log, isCancel, cancel, confirm, note } from "@clack/prompts";
import open from "open";

interface ProvisionArgs {
  token: string;
  teamId: string | null;
  projectId: string;
  projectName: string;
  ownerSlug: string;
}

function projectStoresUrl(args: ProvisionArgs): string {
  return `https://vercel.com/${args.ownerSlug}/${args.projectName}/stores`;
}

interface ConnectionStrings {
  databaseUrl: string;
  redisUrl: string | null;
}

interface VercelEnvVar {
  id: string;
  key: string;
  value: string;
  target: string[];
}

async function fetchSingleEnvValue(
  args: ProvisionArgs,
  envId: string,
): Promise<string | null> {
  // The list endpoint's `?decrypt=true` doesn't actually return decrypted values
  // for marketplace-managed env vars (they come back as encrypted JSON blobs).
  // The single-env endpoint returns the real value.
  const url = args.teamId
    ? `https://api.vercel.com/v1/projects/${args.projectId}/env/${envId}?teamId=${args.teamId}`
    : `https://api.vercel.com/v1/projects/${args.projectId}/env/${envId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${args.token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { value?: string };
  return data.value ?? null;
}

async function fetchProjectEnvVar(
  args: ProvisionArgs,
  candidateKeys: string[],
  prefixes: string[],
): Promise<string | null> {
  const listUrl = args.teamId
    ? `https://api.vercel.com/v10/projects/${args.projectId}/env?teamId=${args.teamId}`
    : `https://api.vercel.com/v10/projects/${args.projectId}/env`;

  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${args.token}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { envs: VercelEnvVar[] };

  for (const key of candidateKeys) {
    const match = data.envs.find((e) => e.key === key);
    if (!match) continue;
    const value = await fetchSingleEnvValue(args, match.id);
    if (value && prefixes.some((p) => value.startsWith(p))) {
      return value;
    }
  }
  return null;
}

async function pollForEnvVar(
  args: ProvisionArgs,
  label: string,
  candidateKeys: string[],
  prefixes: string[],
): Promise<string> {
  // After the user confirms, give Vercel a brief moment to propagate, then fetch.
  // Retry a few times with backoff before falling back to manual paste.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const proceed = await confirm({
      message:
        attempt === 1
          ? `Done? I'll grab ${label} from your Vercel project env.`
          : `Still can't find ${label}. Try again?`,
      initialValue: true,
    });
    if (isCancel(proceed) || !proceed) {
      cancel("Cancelled.");
      process.exit(0);
    }

    const s = spinner();
    s.start(`Fetching ${label} from Vercel project env vars`);
    // Small delay before first fetch so Vercel has time to inject the var.
    await new Promise((r) => setTimeout(r, 1500));
    const value = await fetchProjectEnvVar(args, candidateKeys, prefixes);
    if (value) {
      s.stop(`${label} found`);
      return value;
    }
    s.stop(`${label} not yet on the project`);
    log.warn(
      `Make sure you clicked "Connect" so the integration injects ${candidateKeys.join(" / ")} into "${args.projectName}".`,
    );
  }

  throw new Error(
    `Could not find ${label} on the project after several attempts. ` +
      `Open ${projectStoresUrl(args)}, finish the connect flow, then re-run.`,
  );
}

async function provisionPostgres(args: ProvisionArgs): Promise<string> {
  const s = spinner();
  s.start("Checking project for an existing Postgres connection");
  const existing = await fetchProjectEnvVar(
    args,
    ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"],
    ["postgres://", "postgresql://"],
  );
  if (existing) {
    s.stop("Postgres already connected - reusing existing DATABASE_URL");
    return existing;
  }
  s.message("Provisioning Neon Postgres via Vercel Marketplace");

  const url = args.teamId
    ? `https://api.vercel.com/v1/storage/stores?teamId=${args.teamId}`
    : `https://api.vercel.com/v1/storage/stores`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "postgres",
      name: "trustclaw-postgres",
      projectId: args.projectId,
    }),
  });

  if (res.ok) {
    const data = (await res.json()) as { connectionString: string };
    s.stop("Postgres provisioned");
    return data.connectionString;
  }

  s.stop("Auto-provisioning unavailable; opening project stores page");
  note(
    `Opening the stores page for "${args.projectName}". From there:\n` +
      `  1. Click "Create Database"\n` +
      `  2. Pick "Neon" → Continue\n` +
      `  3. Continue\n` +
      `  4. Check "Development" (and Preview) so DATABASE_URL is set in all envs\n` +
      `  5. Click "Connect"\n` +
      `(The project is already selected since you're on its stores page.)`,
    "Set up Neon Postgres",
  );
  await open(projectStoresUrl(args));

  return pollForEnvVar(
    args,
    "DATABASE_URL",
    ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"],
    ["postgres://", "postgresql://"],
  );
}

async function provisionRedis(args: ProvisionArgs): Promise<string> {
  const s = spinner();
  s.start("Checking project for an existing Redis connection");
  const existing = await fetchProjectEnvVar(
    args,
    ["REDIS_URL", "KV_URL"],
    ["redis://", "rediss://"],
  );
  if (existing) {
    s.stop("Redis already connected - reusing existing REDIS_URL");
    return existing;
  }
  s.message("Provisioning Upstash Redis via Vercel Marketplace");

  const url = args.teamId
    ? `https://api.vercel.com/v1/storage/stores?teamId=${args.teamId}`
    : `https://api.vercel.com/v1/storage/stores`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "redis",
      name: "trustclaw-redis",
      projectId: args.projectId,
    }),
  });

  if (res.ok) {
    const data = (await res.json()) as { connectionString: string };
    s.stop("Redis provisioned");
    return data.connectionString;
  }

  s.stop("Auto-provisioning unavailable; opening project stores page");
  note(
    `Opening the stores page for "${args.projectName}". From there:\n` +
      `  1. Click "Create Database"\n` +
      `  2. Pick "Redis" (Upstash)\n` +
      `  3. Walk through the creator steps → Click "Create"\n` +
      `  4. Check "Development" (and Preview) so REDIS_URL is set in all envs\n` +
      `  5. Click "Connect"\n` +
      `(The project is already selected since you're on its stores page.)`,
    "Set up Upstash Redis",
  );
  await open(projectStoresUrl(args));

  return pollForEnvVar(
    args,
    "REDIS_URL",
    ["REDIS_URL", "KV_URL"],
    ["redis://", "rediss://"],
  );
}

export async function provisionStores(
  args: ProvisionArgs & { enableRedis: boolean },
): Promise<ConnectionStrings> {
  const databaseUrl = await provisionPostgres(args);
  const redisUrl = args.enableRedis ? await provisionRedis(args) : null;
  return { databaseUrl, redisUrl };
}

void cancel;
void isCancel;
