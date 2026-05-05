import { intro, outro, note, cancel } from "@clack/prompts";
import open from "open";
import { detectAuth } from "./auth.js";
import { askProjectName, gatherRemainingInputs, isValidComposioKey } from "./inputs.js";
import { forkRepo } from "./github.js";
import {
  detectLocalRepo,
  confirmLocalPublish,
  publishLocalCopy,
} from "./local-repo.js";
import { applyPlanConfig } from "./cron-config.js";
import { createVercelProject, disableDeploymentProtection } from "./vercel.js";
import { provisionStores } from "./stores.js";
import { setEnvVars } from "./env-vars.js";
import { runMigration } from "./migrate.js";
import { triggerProductionDeploy } from "./trigger-deploy.js";
import { maybeSetupTelegram } from "./telegram-setup.js";
import {
  fetchProjectEnvValue,
  getProductionAlias,
  listProjectEnvKeys,
  lookupExistingProject,
} from "./vercel-env.js";
import { loadConfig, saveConfig } from "./config.js";

export async function deploy(): Promise<void> {
  console.clear();
  intro("trustclaw deploy");

  try {
    const auth = await detectAuth();

    // Detect local checkout up front so we can read cached defaults from
    // .trustclaw-deploy.json (project name, repo name) and pre-fill prompts.
    const localRepo = await detectLocalRepo();
    const cachedConfig = localRepo ? await loadConfig(localRepo.rootDir) : {};

    const projectName = await askProjectName(cachedConfig.vercelProjectName);

    // Pre-flight: if the project already exists, fetch its env keys so we can
    // skip prompts (Composio key, Redis question, Telegram setup) for anything
    // that's already been configured on a prior run.
    const existingProject = await lookupExistingProject({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectName,
    });
    const existingEnvKeys = existingProject
      ? await listProjectEnvKeys({
          token: auth.vercelToken,
          teamId: auth.vercelTeamId,
          projectId: existingProject.id,
        })
      : new Set<string>();

    // If COMPOSIO_API_KEY exists, sanity-check the value is actually a Composio
    // key (we've seen UI text accidentally pasted) so we can re-prompt instead
    // of silently reusing junk.
    let existingComposioKeyValid = false;
    if (existingProject && existingEnvKeys.has("COMPOSIO_API_KEY")) {
      const value = await fetchProjectEnvValue(
        {
          token: auth.vercelToken,
          teamId: auth.vercelTeamId,
          projectId: existingProject.id,
        },
        "COMPOSIO_API_KEY",
      );
      existingComposioKeyValid = isValidComposioKey(value);
    }

    const remaining = await gatherRemainingInputs({
      existingEnvKeys,
      existingComposioKeyValid,
    });

    let repo: string;
    if (localRepo) {
      const choice = await confirmLocalPublish(localRepo, cachedConfig.githubRepoName);
      if (choice) {
        await applyPlanConfig(localRepo.rootDir, auth.vercelBillingPlan);
        ({ repo } = await publishLocalCopy({
          token: auth.githubToken,
          username: auth.githubUsername,
          repoName: choice.repoName,
          rootDir: localRepo.rootDir,
          currentBranch: localRepo.currentBranch,
        }));
        await saveConfig(localRepo.rootDir, { githubRepoName: choice.repoName });
      } else {
        ({ repo } = await forkRepo(auth.githubToken, auth.githubUsername));
      }
    } else {
      ({ repo } = await forkRepo(auth.githubToken, auth.githubUsername));
    }

    const project = await createVercelProject({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectName,
      githubRepoSlug: repo,
      githubToken: auth.githubToken,
    });

    // Project created/reused successfully - cache the name so future runs
    // skip the prompt.
    if (localRepo) {
      await saveConfig(localRepo.rootDir, { vercelProjectName: project.name });
    }

    // Vercel enables SSO on new projects by default ("all_except_custom_domains"),
    // which makes external webhooks (Telegram, etc.) hit a login wall. Turn it off.
    await disableDeploymentProtection({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
    });

    const stores = await provisionStores({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      projectName: project.name,
      ownerSlug: auth.vercelOwnerSlug,
      enableRedis: remaining.enableRedis,
    });

    await setEnvVars({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      composioApiKey: remaining.composioApiKey,
      hasBetterAuthSecret: existingEnvKeys.has("BETTER_AUTH_SECRET"),
      hasCronSecret: existingEnvKeys.has("CRON_SECRET"),
    });

    await runMigration(stores.databaseUrl);

    const result = await triggerProductionDeploy({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      githubRepoSlug: repo,
    });

    // Print outside the clack box so the URL doesn't wrap across lines and
    // stays copy-friendly.
    const deploymentUrl = `https://${result.url}`;
    console.log(`\n  Deployment URL: ${deploymentUrl}\n`);
    await open(deploymentUrl).catch(() => {});

    // Use the stable production alias (e.g. trustclaw-test.vercel.app) for the
    // Telegram webhook so it survives across redeploys. The per-deployment URL
    // returned by triggerProductionDeploy changes on every push.
    const stableUrl = await getProductionAlias({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      projectName: project.name,
    });

    await maybeSetupTelegram({
      vercelToken: auth.vercelToken,
      vercelTeamId: auth.vercelTeamId,
      projectId: project.id,
      deploymentUrl: stableUrl,
      githubRepoSlug: repo,
      existingEnvKeys,
    });

    note(
      "Cron jobs are pre-configured in vercel.json and will run automatically once deploy completes.\n" +
        "View them in your Vercel dashboard under the project's Cron Jobs tab.",
      "Cron",
    );

    outro("Visit the deployment URL above to register your first user.");
  } catch (err) {
    cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
