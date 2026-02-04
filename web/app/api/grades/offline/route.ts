import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

async function isStaff(course_id: string, user_id: string) {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("user_id", user_id)
    .single();
  if (prof?.is_admin) return true;
  const role = (prof?.role ?? "").toLowerCase();
  if (role === "admin" || role === "teacher") return true;
  const { data: ct } = await supabaseAdmin
    .from("course_teachers")
    .select("id")
    .eq("course_id", course_id)
    .eq("teacher_id", user_id)
    .maybeSingle();
  return !!ct;
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

    if (!(await isStaff(course_id, uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: enrollments, error: sErr } = await supabaseAdmin
      .from("enrollments")
      .select("user_id")
      .eq("course_id", course_id);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });
    const studentIds = (enrollments ?? []).map((r: any) => r.user_id);

    let profiles: any[] = [];
    if (studentIds.length > 0) {
      const { data: profs, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id, username, nickname")
        .in("user_id", studentIds);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
      profiles = profs ?? [];
    }
    const map = new Map<string, any>();
    profiles.forEach((p) => map.set(p.user_id, p));
    const studentList = studentIds.map((id) => ({
      user_id: id,
      username: map.get(id)?.username ?? null,
      nickname: map.get(id)?.nickname ?? null,
    }));

    const { data: grades, error: gErr } = await supabaseAdmin
      .from("offline_grades")
      .select("id, student_id, title, max_score, score, feedback, graded_at, unit_id, student_publish_at")
      .eq("course_id", course_id)
      .order("graded_at", { ascending: false });
    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 400 });

    const { data: units, error: uErr } = await supabaseAdmin
      .from("offline_grade_units")
      .select("id, title, max_score, publish_at, created_at")
      .eq("course_id", course_id)
      .order("created_at", { ascending: false });
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, students: studentList, grades: grades ?? [], units: units ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    const body = await req.json();
    const { course_id, student_id, title, score, max_score, feedback, unit_id, student_publish_at } = body ?? {};
    if (!course_id || !student_id)
      return NextResponse.json({ error: "Missing course_id or student_id" }, { status: 400 });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;

    if (!(await isStaff(course_id, uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await supabaseAdmin
      .from("offline_grades")
      .insert({
        course_id,
        student_id,
        title: title || "Offline grade",
        max_score: max_score ?? null,
        score: score ?? null,
        feedback: feedback ?? null,
        unit_id: unit_id ?? null,
        student_publish_at: student_publish_at ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, grade: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
