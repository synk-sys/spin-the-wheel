import { organizerRoute } from "@/lib/api/handler";
import { dataBackend } from "@/lib/store";

export const GET = organizerRoute(async (_req, { env, service, actor }) => {
  const state = await service.getState(env);
  const [pub, prizes, draws] = await Promise.all([service.getPublicDisplay(env), service.listPrizes(env), service.listDraws(env)]);
  const activeDraw = state.activeDrawId ? (draws.find((d) => d.drawId === state.activeDrawId) ?? null) : null;
  return {
    env,
    actor: actor.email,
    backend: dataBackend(),
    serverNow: Date.now(),
    state: {
      status: state.status,
      currentPrizeId: state.currentPrizeId,
      activeDrawId: state.activeDrawId,
      drawSequence: state.drawSequence,
      eligibleCount: state.eligibleCount,
      winnerCount: state.winnerCount,
      participantCount: state.participantCount,
      soundEnabled: state.soundEnabled,
      drawInProgress: !!state.drawLock && state.drawLock.expiresAt > Date.now(),
      spinEndsAt: state.spinEndsAt,
    },
    public: pub,
    prizes,
    activeDraw,
    recentDraws: draws.slice(-10).reverse(),
  };
});
