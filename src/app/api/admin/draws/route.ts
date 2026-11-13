import { z } from "zod";
import { organizerRoute } from "@/lib/api/handler";
import { idempotencyKeySchema } from "@/lib/domain/types";

export const GET = organizerRoute(async (_req, { env, service }) => ({ draws: await service.listDraws(env) }));

/** Starts a draw. The server picks the winner; the client only animates it. */
export const POST = organizerRoute(async (_req, { env, service, actor, body }) => {
  const input = z.object({ prizeId: z.string().min(1).max(100), idempotencyKey: idempotencyKeySchema }).parse(body);
  return service.draw(env, actor, input);
});
