import { text, password, confirm, isCancel, cancel, note, log } from "@clack/prompts";
import open from "open";

const COMPOSIO_DASHBOARD_URL =
  "https://dashboard.composio.dev/login?next=%2F~%2Fproject%2Fsettings%2Fapi-keys&flow=developer";

export interface UserInputs {
  // null = reuse the existing key already on the Vercel project.
  composioApiKey: string | null;
  enableRedis: boolean;
  projectName: string;
}

function ensure<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return value as T;
}

export async function askProjectName(defaultName?: string): Promise<string> {
  return ensure(
    await text({
      message: "Vercel project name",
      initialValue: defaultName ?? "trustclaw",
      validate: (v) =>
        v && /^[a-z0-9-]+$/.test(v)
          ? undefined
          : "Lowercase letters, numbers, and dashes only",
    }),
  );
}

// Composio keys are alphanumeric (with underscores/dashes) and start with `ak_`.
// Reject anything else - we've seen UI text get pasted into the prompt by accident.
const COMPOSIO_KEY_RE = /^ak_[A-Za-z0-9_-]{10,}$/;

export function isValidComposioKey(value: string | null | undefined): boolean {
  if (!value) return false;
  return COMPOSIO_KEY_RE.test(value.trim());
}

interface RemainingInputsArgs {
  existingEnvKeys: Set<string>;
  existingComposioKeyValid: boolean;
}

export async function gatherRemainingInputs(
  args: RemainingInputsArgs,
): Promise<{ composioApiKey: string | null; enableRedis: boolean }> {
  let composioApiKey: string | null = null;
  if (
    args.existingEnvKeys.has("COMPOSIO_API_KEY") &&
    args.existingComposioKeyValid
  ) {
    log.info("COMPOSIO_API_KEY already set on the project - reusing.");
  } else {
    if (args.existingEnvKeys.has("COMPOSIO_API_KEY")) {
      log.warn(
        "Existing COMPOSIO_API_KEY on the project doesn't look like a valid Composio key - re-entering.",
      );
    }
    note(
      `Opening Composio - sign in (free), then copy your API key from the page.`,
      "Composio",
    );
    await open(COMPOSIO_DASHBOARD_URL).catch(() => {
      // Headless env - the URL was printed above for manual copy.
    });
    const raw = ensure(
      await password({
        message: "Composio API key",
        validate: (v) => {
          const trimmed = (v ?? "").trim();
          if (!trimmed) return "Required";
          if (!trimmed.startsWith("ak_"))
            return "Composio keys start with 'ak_'";
          if (!COMPOSIO_KEY_RE.test(trimmed))
            return "Key looks malformed - copy directly from dashboard.composio.dev";
          return undefined;
        },
      }),
    );
    composioApiKey = raw.trim();
  }

  let enableRedis: boolean;
  if (
    args.existingEnvKeys.has("REDIS_URL") ||
    args.existingEnvKeys.has("KV_URL")
  ) {
    log.info("Redis already connected to the project - reusing.");
    enableRedis = true;
  } else {
    enableRedis = ensure(
      await confirm({
        message: "Add Upstash Redis for resumable streams? (recommended)",
        initialValue: true,
      }),
    );
  }

  return { composioApiKey, enableRedis };
}
