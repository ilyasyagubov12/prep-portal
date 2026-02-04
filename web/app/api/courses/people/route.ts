import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const course_id = searchParams.get("course_id");
    if (!course_id) return NextResponse.json({ error: "Missing course_id" }, { status: 400 });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;

    const { data: enrRows, error: enrErr } = await supabaseAdmin
      .from("enrollments")
      .select("user_id")
      .eq("course_id", course_id);
    if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 400 });
    const studentIds = (enrRows ?? []).map((r: any) => r.user_id);

    const { data: teacherRows, error: tErr } = await supabaseAdmin
      .from("course_teachers")
      .select("teacher_id")
      .eq("course_id", course_id);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });
    const teacherIds = (teacherRows ?? []).map((r: any) => r.teacher_id);

    const uniqueIds = Array.from(new Set([...studentIds, ...teacherIds]));
    let profiles: any[] = [];
    if (uniqueIds.length > 0) {
      const { data: profs, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id, username, nickname, role")
        .in("user_id", uniqueIds);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
      profiles = profs ?? [];
    }
    const map = new Map<string, any>();
    profiles.forEach((p) => map.set(p.user_id, p));

    const students = studentIds.map((id) => {
      const p = map.get(id) || {};
      return { user_id: id, username: p.username ?? null, nickname: p.nickname ?? null, role: p.role ?? null };
    });
    const teachers = teacherIds.map((id) => {
      const p = map.get(id) || {};
      return { user_id: id, username: p.username ?? null, nickname: p.nickname ?? null, role: p.role ?? "teacher" };
    });

    return NextResponse.json({ ok: true, students, teachers }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
