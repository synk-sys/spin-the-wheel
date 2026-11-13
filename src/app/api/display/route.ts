import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, getService } from "@/lib/api/handler";
import { raffleEnvSchema } from "@/lib/domain/types";

/**
 * Public, read-only projector state. Contains only projector-safe fields
 * (names, ticket numbers, prize info, counts) — never emails or admin data.
 * The projector can never initiate or authorize anything.
 */
export async function GET(req: NextRequest) {
  try {
    const env = raffleEnvSchema.parse(req.nextUrl.searchParams.get("env") ?? "production");
    const service = await getService();
    const state = await service.getPublicDisplay(env);
    return NextResponse.json({ state, serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
