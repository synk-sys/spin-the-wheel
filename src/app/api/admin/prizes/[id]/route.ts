import { organizerRoute } from "@/lib/api/handler";

export const PATCH = organizerRoute<{ id: string }>(async (_req, { env, service, actor, body }, { id }) => ({
  prize: await service.updatePrize(env, actor, id, body.changes),
}));

export const DELETE = organizerRoute<{ id: string }>(async (_req, { env, service, actor }, { id }) => {
  await service.deletePrize(env, actor, id);
  return { ok: true };
});
