import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

async function requireAdmin(token: string) {
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user) return { ok: false as const, status: 401, error: "Invalid token" };

  const uid = userData.user.id;

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("role,is_admin")
    .eq("user_id", uid)
    .maybeSingle();

  if (profErr) return { ok: false as const, status: 500, error: profErr.message };

  const role = (prof?.role ?? "").toLowerCase();
  const isAdmin = !!prof?.is_admin || role === "admin";
  if (!isAdmin) return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, uid };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const guard = await requireAdmin(token);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const body = await req.json().catch(() => ({}));
    const q = String(body?.q ?? "").trim();
    const role = body?.role ? String(body.role).toLowerCase() : null; // "student" | "teacher" | null
    const limit = Math.min(Math.max(Number(body?.limit ?? 20), 1), 50);

    // base query
    let query = supabaseAdmin
      .from("profiles")
      .select("user_id, nickname, role, is_admin, avatar_url")
      .limit(limit);

    if (role) query = query.eq("role", role);

    // ✅ if q is empty -> list users (first N)
    if (q.length === 0) {
      const { data, error } = await query.order("nickname", { ascending: true, nullsFirst: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, users: data ?? [] });
    }

    // ✅ if q is too short -> return empty
    if (q.length < 2) {
      return NextResponse.json({ ok: true, users: [] });
    }

    // ✅ normal search
    const { data, error } = await query
.or(`nickname.ilike.%${q}%`)
      .order("nickname", { ascending: true, nullsFirst: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, users: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

