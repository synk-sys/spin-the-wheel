import { organizerRoute } from "@/lib/api/handler";

export const GET = organizerRoute(async (_req, { env, service }) => ({ participants: await service.listParticipants(env) }));

export const POST = organizerRoute(async (_req, { env, service, actor, body }) => ({
  participant: await service.addParticipant(env, actor, body.participant),
}));
