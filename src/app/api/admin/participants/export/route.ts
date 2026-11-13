import { organizerRoute } from "@/lib/api/handler";
import { csvResponse, toCsv } from "@/lib/csv/export";

export const GET = organizerRoute(async (_req, { env, service, actor }) => {
  const participants = await service.listParticipants(env);
  await service.recordAudit(env, actor, "participants.exported", null, { count: participants.length });
  const csv = toCsv(
    ["participantId", "attendeeId", "name", "email", "ticketNumber", "company", "status", "prizeWon", "drawId", "createdAt"],
    participants.map((p) => [
      p.participantId,
      p.attendeeId,
      p.name,
      p.email,
      p.ticketNumber,
      p.company,
      p.eligibilityStatus,
      p.prizeName,
      p.drawId,
      new Date(p.createdAt).toISOString(),
    ]),
  );
  return csvResponse(`participants-${env}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});
