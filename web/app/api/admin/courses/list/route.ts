import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function bearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

async function requireAdmin(token: string) {
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) return { ok: false as const, status: 401, error: "Invalid token" };

  const uid = userData.user.id;
  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("user_id", uid)
    .maybeSingle();

  if (profErr) return { ok: false as const, status: 500, error: profErr.message };

  const role = (prof?.role ?? "").toLowerCase();
  const isAdmin = !!prof?.is_admin || role === "admin";
  if (!isAdmin) return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, uid };
}

export async function GET(req: Request) {
  try {
    const token = bearer(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const guard = await requireAdmin(token);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { data, error } = await supabaseAdmin
      .from("courses")
      .select("id, slug, title")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, courses: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
