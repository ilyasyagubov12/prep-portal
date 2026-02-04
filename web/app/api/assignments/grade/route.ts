import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

async function requireTeacherOrAdmin(token: string, course_id: string) {
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

    const body = await req.json();
    const submission_id = body?.submission_id as string | undefined;
    const score = typeof body?.score === "number" ? body.score : null;
    const feedback = typeof body?.feedback === "string" ? body.feedback.trim() : null;

    if (!submission_id) return NextResponse.json({ error: "Missing submission_id" }, { status: 400 });

    const { data: submission, error: sErr } = await supabaseAdmin
      .from("submissions")
      .select("id, assignment_id")
      .eq("id", submission_id)
      .single();

    if (sErr || !submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    const { data: assignment, error: aErr } = await supabaseAdmin
      .from("assignments")
      .select("course_id")
      .eq("id", submission.assignment_id)
      .single();

    if (aErr || !assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

    const guard = await requireTeacherOrAdmin(token, assignment.course_id);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    // Upsert grade per submission
    const { data: existing, error: gErr } = await supabaseAdmin
      .from("grades")
      .select("id")
      .eq("submission_id", submission_id)
      .maybeSingle();

    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 400 });

    let gradeRow;
    if (existing?.id) {
      const { data: updated, error: upErr } = await supabaseAdmin
        .from("grades")
        .update({
          score,
          feedback,
          grader_id: guard.uid,
          graded_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, submission_id, grader_id, score, feedback, graded_at")
        .single();

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
      gradeRow = updated;
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("grades")
        .insert({
          submission_id,
          grader_id: guard.uid,
          score,
          feedback,
          graded_at: new Date().toISOString(),
        })
        .select("id, submission_id, grader_id, score, feedback, graded_at")
        .single();

      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
      gradeRow = inserted;
    }

    return NextResponse.json({ ok: true, grade: gradeRow }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
