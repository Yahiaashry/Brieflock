import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Invite } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["firm_admin", "lawyer", "paralegal"]),
  clearance_level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    if (profile.role !== "firm_admin") throw ApiError.forbidden();
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data, error } = await auth.supabase
      .from("invites")
      .select(
        "id, firm_id, email, role, clearance_level, created_by, created_at, expires_at, accepted_at",
      )
      .eq("firm_id", profile.firm_id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .returns<Invite[]>();

    if (error) throw new Error("Unable to load invitations.");

    return jsonResponse(
      { data: data ?? [], page: { next_cursor: null } },
      request,
    );
  });
}

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    if (profile.role !== "firm_admin") throw ApiError.forbidden();
    enforceRateLimit(`user:${profile.id}`, "auth");

    const body = inviteSchema.parse(await request.json());
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { data: invite, error } = await auth.supabase
      .from("invites")
      .insert({
        firm_id: profile.firm_id,
        email: body.email.toLowerCase(),
        role: body.role,
        clearance_level: body.clearance_level,
        token_hash: tokenHash,
        created_by: profile.id,
      })
      .select(
        "id, firm_id, email, role, clearance_level, created_by, created_at, expires_at, accepted_at",
      )
      .single<Invite>();

    if (error) throw new Error("Unable to create the invite.");

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        action: "firm.updated",
        result: "allow",
        details: {
          type: "invite_sent",
          invite_id: invite.id,
          email_hash: createHash("sha256")
            .update(body.email.toLowerCase())
            .digest("hex"),
        },
      },
      auth.geography,
    );

    const developmentToken =
      process.env.NODE_ENV === "production" ? undefined : token;

    return jsonResponse(
      {
        invite,
        ...(developmentToken ? { invite_token: developmentToken } : {}),
      },
      request,
      { status: 201 },
    );
  });
}
