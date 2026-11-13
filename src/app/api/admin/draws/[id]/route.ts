import { z } from "zod";
import { organizerRoute } from "@/lib/api/handler";

const schema = z.object({
  action: z.enum(["announce", "confirm", "claim", "absent", "void"]),
  reason: z.string().max(500).nullish(),
});

export const POST = organizerRoute<{ id: string }>(async (_req, { env, service, actor, body }, { id }) => {
  const { action, reason } = schema.parse(body);
  return { draw: await service.updateDrawStatus(env, actor, id, action, reason) };
});
