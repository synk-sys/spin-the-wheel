import { z } from "zod";
import { organizerRoute } from "@/lib/api/handler";

const schema = z.object({ ids: z.array(z.string().max(100)).max(5000), status: z.enum(["eligible", "ineligible"]) });

export const POST = organizerRoute(async (_req, { env, service, actor, body }) => {
  const { ids, status } = schema.parse(body);
  return service.bulkSetEligibility(env, actor, ids, status);
});
