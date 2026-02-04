import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;

    const body = await req.json();
    const assignment_id = body?.assignment_id as string | undefined;
    const file_path = body?.file_path as string | undefined;
    const file_name = typeof body?.file_name === "string" ? body.file_name : null;
    const file_size = typeof body?.file_size === "number" ? body.file_size : null;
    const mime_type = typeof body?.mime_type === "string" ? body.mime_type : null;

    if (!assignment_id || !file_path) {
      return NextResponse.json({ error: "Missing assignment_id or file_path" }, { status: 400 });
    }

    const { data: assignment, error: aErr } = await supabaseAdmin
      .from("assignments")
      .select("id, course_id, status, due_at, max_submissions")
      .eq("id", assignment_id)
      .single();

    if (aErr || !assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    if (assignment.status !== "published") {
      return NextResponse.json({ error: "Assignment is not published" }, { status: 400 });
    }

    if (assignment.due_at) {
      const dueTs = Date.parse(assignment.due_at as string);
      if (Number.isFinite(dueTs) && Date.now() > dueTs) {
        return NextResponse.json({ error: "Submission window is closed" }, { status: 400 });
      }
    }

    // Ensure user is enrolled in the course
    const { data: enrollment, error: enrErr } = await supabaseAdmin
      .from("enrollments")
      .select("user_id")
      .eq("course_id", assignment.course_id)
      .eq("user_id", uid)
      .maybeSingle();

    if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 });
    if (!enrollment) return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 });

    if (assignment.max_submissions) {
      const { count, error: countErr } = await supabaseAdmin
        .from("submissions")
        .select("*", { count: "exact", head: true })
        .eq("assignment_id", assignment_id)
        .eq("student_id", uid);

      if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
      if ((count ?? 0) >= assignment.max_submissions) {
        return NextResponse.json({ error: "Submission limit reached" }, { status: 400 });
      }
    }

    const { data: submission, error: sErr } = await supabaseAdmin
      .from("submissions")
      .insert({
        assignment_id,
        student_id: uid,
        file_path,
        file_name,
        file_size,
        mime_type,
      })
      .select("id, assignment_id, student_id, file_path, file_name, file_size, mime_type, created_at")
      .single();

    if (sErr || !submission) {
      return NextResponse.json({ error: sErr?.message ?? "Failed to save submission" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, submission }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
