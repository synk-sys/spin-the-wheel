import { z } from "zod";
import { organizerRoute } from "@/lib/api/handler";
import { MAX_IMPORT_ROWS } from "@/lib/csv/import";

const schema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_IMPORT_ROWS),
  fileName: z.string().max(200).nullish(),
  overrideDuplicates: z.array(z.number().int().min(0)).max(MAX_IMPORT_ROWS).optional(),
});

export const POST = organizerRoute(async (_req, { env, service, actor, body }) => {
  const input = schema.parse(body);
  return service.importParticipants(env, actor, input);
});
