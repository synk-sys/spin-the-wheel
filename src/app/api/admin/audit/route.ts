import { organizerRoute } from "@/lib/api/handler";

export const GET = organizerRoute(async (_req, { env, service }) => ({ events: await service.listAudit(env, 1000) }));
