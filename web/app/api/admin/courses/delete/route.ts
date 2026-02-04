import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) return { error: "Missing Bearer token", status: 401 as const };

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user) return { error: "Invalid token", status: 401 as const };

  const adminId = userData.user.id;

  const { data: adminProfile, error: adminProfileErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", adminId)
    .single();

  if (adminProfileErr) return { error: adminProfileErr.message, status: 500 as const };
  if (!adminProfile?.is_admin) return { error: "Not admin", status: 403 as const };

  return { ok: true as const };
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (!("ok" in guard)) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await req.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabaseAdmin.from("courses").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
