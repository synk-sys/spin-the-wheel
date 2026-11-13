import { z } from "zod";
import { organizerRoute } from "@/lib/api/handler";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("next-prize") }),
  z.object({ action: z.literal("clear-reveal") }),
  z.object({ action: z.literal("set-prize"), prizeId: z.string().max(100).nullable() }),
  z.object({ action: z.literal("sound"), enabled: z.boolean() }),
  z.object({ action: z.literal("reset-demo"), confirmation: z.string().max(50) }),
]);

export const POST = organizerRoute(async (_req, { env, service, actor, body }) => {
  const cmd = schema.parse(body);
  switch (cmd.action) {
    case "pause":
      return service.setPaused(env, actor, true);
    case "resume":
      return service.setPaused(env, actor, false);
    case "next-prize":
      return { prize: await service.nextPrize(env, actor) };
    case "clear-reveal":
      return service.clearReveal(env, actor);
    case "set-prize":
      return service.setCurrentPrize(env, actor, cmd.prizeId);
    case "sound":
      return service.setSound(env, actor, cmd.enabled);
    case "reset-demo":
      return service.resetDemo(env, actor, cmd.confirmation);
  }
});
