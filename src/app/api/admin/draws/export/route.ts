import { organizerRoute } from "@/lib/api/handler";
import { csvResponse, toCsv } from "@/lib/csv/export";

const iso = (t: number | null) => (t ? new Date(t).toISOString() : "");

export const GET = organizerRoute(async (_req, { env, service, actor }) => {
  const [draws, participants] = await Promise.all([service.listDraws(env), service.listParticipants(env)]);
  const byId = new Map(participants.map((p) => [p.participantId, p]));
  await service.recordAudit(env, actor, "draws.exported", null, { count: draws.length });
  const csv = toCsv(
    [
      "drawNumber", "drawId", "prize", "winnerName", "ticketNumber", "attendeeId", "email", "status",
      "eligiblePoolSize", "initiatedBy", "drawnAt", "announcedAt", "confirmedAt", "claimedAt", "absentAt", "voidedAt", "voidReason", "statusHistory",
    ],
    draws.map((d) => [
      d.drawNumber, d.drawId, d.prizeNameSnapshot, d.winnerNameSnapshot, d.ticketNumberSnapshot,
      byId.get(d.participantId)?.attendeeId ?? "", byId.get(d.participantId)?.email ?? "", d.status,
      d.eligiblePoolSize, d.initiatedBy, iso(d.createdAt), iso(d.announcedAt), iso(d.confirmedAt), iso(d.claimedAt),
      iso(d.absentAt), iso(d.voidedAt), d.voidReason,
      d.statusHistory.map((h) => `${h.status}@${iso(h.at)} by ${h.by}${h.reason ? ` (${h.reason})` : ""}`).join(" | "),
    ]),
  );
  return csvResponse(`winner-history-${env}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});
