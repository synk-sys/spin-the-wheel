import { organizerRoute } from "@/lib/api/handler";

export const GET = organizerRoute(async (_req, { env, service }) => ({ prizes: await service.listPrizes(env) }));

export const POST = organizerRoute(async (_req, { env, service, actor, body }) => ({
  prize: await service.createPrize(env, actor, body.prize),
}));
