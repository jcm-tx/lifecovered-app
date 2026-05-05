import { protectedProcedure } from "~/server/api/trpc";
import { createComposioClient } from "~/server/clients/composio";
import { getToolkitsInput } from "./getToolkits.schema";
import { env } from "~/env";

export const getToolkits = protectedProcedure
  .input(getToolkitsInput)
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const composio = createComposioClient();
    const session = await composio.create(userId, {
      authConfigs: env.TWITTER_AUTH_CONFIG
        ? { twitter: env.TWITTER_AUTH_CONFIG }
        : {},
    });

    // 1. Fetch toolkit listing
    const toolkitsResult = await session.toolkits({
      ...(input.search && input.search.length >= 3
        ? { search: input.search }
        : {}),
      ...(input.isConnected !== undefined
        ? { isConnected: input.isConnected }
        : {}),
      limit: input.limit,
      nextCursor: input.cursor,
    });

    if (toolkitsResult.items.length === 0) {
      return { items: [], nextCursor: null };
    }

    // 2. Merge and return
    const items = toolkitsResult.items.map((toolkit) => ({
      slug: toolkit.slug,
      name: toolkit.name,
      logo: toolkit.logo ?? `https://logos.composio.dev/api/${toolkit.slug}`,
      noAuth: toolkit.isNoAuth,
      connected: !!toolkit.connection?.isActive,
    }));

    return {
      items,
      nextCursor: toolkitsResult.nextCursor ?? null,
    };
  });
