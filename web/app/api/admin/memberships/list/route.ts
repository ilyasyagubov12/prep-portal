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

    const { course_id } = await req.json();
    if (!course_id) return NextResponse.json({ error: "Missing course_id" }, { status: 400 });

    // 1) fetch teacher assignments + student enrollments
    const [{ data: teachers, error: tErr }, { data: enrollments, error: eErr }] = await Promise.all([
      supabaseAdmin
        .from("course_teachers")
        .select("teacher_id, created_at")
        .eq("course_id", course_id)
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("enrollments")
        .select("user_id, enrolled_at")
        .eq("course_id", course_id)
        .order("enrolled_at", { ascending: false }),
    ]);

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });

    // 2) load profiles for display
    const ids = Array.from(
      new Set([
        ...(teachers ?? []).map((x: any) => x.teacher_id),
        ...(enrollments ?? []).map((x: any) => x.user_id),
      ])
    );

    let profiles: any[] = [];
    if (ids.length) {
      const { data: p, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id, nickname, role, is_admin, avatar_url")
        .in("user_id", ids);

      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
      profiles = p ?? [];
    }

    const profMap = new Map(profiles.map((p) => [p.user_id, p]));

    return NextResponse.json({
      ok: true,
      teachers: (teachers ?? []).map((t: any) => ({
        teacher_id: t.teacher_id,
        created_at: t.created_at,
        profile: profMap.get(t.teacher_id) ?? null,
      })),
      students: (enrollments ?? []).map((e: any) => ({
        user_id: e.user_id,
        enrolled_at: e.enrolled_at,
        profile: profMap.get(e.user_id) ?? null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
