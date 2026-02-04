import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

async function requireTeacherOrAdminByCourse(token: string, course_id: string) {
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user) return { ok: false as const, status: 401, error: "Invalid token" };
  const uid = userData.user.id;

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("role,is_admin")
    .eq("user_id", uid)
    .single();

  if (profErr) return { ok: false as const, status: 500, error: profErr.message };

  const role = (prof?.role ?? "").toLowerCase();
  const isAdmin = !!prof?.is_admin || role === "admin";
  if (isAdmin) return { ok: true as const, uid };

  const { data: ct, error: ctErr } = await supabaseAdmin
    .from("course_teachers")
    .select("id")
    .eq("course_id", course_id)
    .eq("teacher_id", uid)
    .maybeSingle();

  if (ctErr) return { ok: false as const, status: 500, error: ctErr.message };
  if (!ct || role !== "teacher") return { ok: false as const, status: 403, error: "Not allowed" };

  return { ok: true as const, uid };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const { course_id, title, description, starts_at, ends_at, repeat_weekly, repeat_until } = await req.json();

    if (!course_id) return NextResponse.json({ error: "Missing course_id" }, { status: 400 });
    if (!title || !String(title).trim()) return NextResponse.json({ error: "Missing title" }, { status: 400 });
    if (!starts_at || !ends_at) return NextResponse.json({ error: "Missing starts_at/ends_at" }, { status: 400 });

    const a = new Date(starts_at).getTime();
    const b = new Date(ends_at).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
      return NextResponse.json({ error: "ends_at must be after starts_at" }, { status: 400 });
    }

    const guard = await requireTeacherOrAdminByCourse(token, course_id);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { data, error } = await supabaseAdmin
      .from("course_events")
      .insert({
        course_id,
        title: String(title).trim(),
        description: description?.trim?.() ? String(description).trim() : null,
        starts_at,
        ends_at,
        repeat_weekly: !!repeat_weekly,
        repeat_until: repeat_until ?? null,
        created_by: guard.uid,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, event: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
