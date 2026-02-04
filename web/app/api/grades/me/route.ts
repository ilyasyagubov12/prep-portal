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

    // get profile to know staff/student
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role, is_admin")
      .eq("user_id", uid)
      .single();
    const isStaffUser =
      !!prof?.is_admin || (prof?.role ?? "").toLowerCase() === "admin" || (prof?.role ?? "").toLowerCase() === "teacher";

    // Get all assignments in course
    const { data: assignments, error: aErr } = await supabaseAdmin
      .from("assignments")
      .select("id, title, status, due_at, max_score")
      .eq("course_id", course_id)
      .order("created_at", { ascending: false });
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });

    // Get all submissions for this student in this course (any assignment)
    const { data: subs, error: sErr } = await supabaseAdmin
      .from("submissions")
      .select("id, assignment_id, file_name, created_at")
      .eq("student_id", uid)
      .in(
        "assignment_id",
        (assignments ?? []).map((a: any) => a.id)
      );
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

    const submissionIds = (subs ?? []).map((s: any) => s.id);

    // Fetch grades for those submissions (latest wins)
    let gradesBySub = new Map<string, any>();
    if (submissionIds.length > 0) {
      const { data: grades, error: gErr } = await supabaseAdmin
        .from("grades")
        .select("submission_id, score, feedback, graded_at")
        .in("submission_id", submissionIds);
      if (gErr) return NextResponse.json({ error: gErr.message }, { status: 400 });
      for (const g of grades ?? []) {
        const prev = gradesBySub.get(g.submission_id);
        if (!prev || Date.parse(g.graded_at ?? 0) > Date.parse(prev.graded_at ?? 0)) {
          gradesBySub.set(g.submission_id, g);
        }
      }
    }

    // Build assignment rows: pick latest submission per assignment, attach its grade if any
    const latestSubByAssignment = new Map<string, any>();
    for (const s of subs ?? []) {
      const prev = latestSubByAssignment.get(s.assignment_id);
      if (!prev || Date.parse(s.created_at ?? 0) > Date.parse(prev.created_at ?? 0)) {
        latestSubByAssignment.set(s.assignment_id, s);
      }
    }

    const rows = (assignments ?? []).map((a: any) => {
      const sub = latestSubByAssignment.get(a.id) ?? null;
      const grade = sub ? gradesBySub.get(sub.id) ?? null : null;
      return {
        id: a.id,
        title: a.title,
        status: a.status,
        due_at: a.due_at,
        max_score: a.max_score,
        submission: sub
          ? {
              id: sub.id,
              created_at: sub.created_at,
              file_name: sub.file_name,
              grade,
            }
          : null,
      };
    });

    // offline units + student grades
    const { data: units, error: uErr } = await supabaseAdmin
      .from("offline_grade_units")
      .select("id, title, max_score, publish_at, course_id, created_at")
      .eq("course_id", course_id);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    const { data: myOffline, error: ogErr } = await supabaseAdmin
      .from("offline_grades")
      .select("id, unit_id, student_id, title, max_score, score, feedback, graded_at, student_publish_at")
      .eq("course_id", course_id)
      .eq("student_id", uid);
    if (ogErr) return NextResponse.json({ error: ogErr.message }, { status: 400 });
    const offlineByUnit = new Map<string, any>();
    (myOffline ?? []).forEach((g: any) => offlineByUnit.set(g.unit_id, g));

    const now = new Date();
    const offlineUnits = (units ?? [])
      .filter((u: any) => isStaffUser || !u.publish_at || new Date(u.publish_at) <= now)
      .map((u: any) => {
        const g = offlineByUnit.get(u.id) ?? null;
        const studentReleaseOk = g?.student_publish_at ? new Date(g.student_publish_at) <= now : true;
        const visible = isStaffUser || (!u.publish_at || new Date(u.publish_at) <= now) && studentReleaseOk;
        return {
          id: u.id,
          title: u.title,
          max_score: u.max_score,
          publish_at: u.publish_at,
          created_at: u.created_at,
          grade: visible && g
            ? {
                score: g.score,
                max_score: g.max_score ?? u.max_score,
                feedback: g.feedback,
                graded_at: g.graded_at,
              }
            : null,
        };
      });

    return NextResponse.json({ ok: true, assignments: rows, offline_units: offlineUnits }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
