import { organizerRoute } from "@/lib/api/handler";

export const PATCH = organizerRoute<{ id: string }>(async (_req, { env, service, actor, body }, { id }) => ({
  participant: await service.updateParticipant(env, actor, id, body.changes),
}));
