import { z } from "zod";
import { organizerRoute } from "@/lib/api/handler";

export const POST = organizerRoute(async (_req, { env, service, actor, body }) => {
  const { order } = z.object({ order: z.array(z.string().max(100)).max(200) }).parse(body);
  await service.reorderPrizes(env, actor, order);
  return { ok: true };
});
