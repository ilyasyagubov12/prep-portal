import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

async function requireTeacherOrAdmin(token: string, assignment_id: string) {
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user) return { ok: false as const, status: 401, error: "Invalid token" };

  const uid = userData.user.id;

  const { data: assignment, error: aErr } = await supabaseAdmin
    .from("assignments")
    .select("id, course_id")
    .eq("id", assignment_id)
    .single();

  if (aErr || !assignment) return { ok: false as const, status: 404, error: "Assignment not found" };

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("role,is_admin")
    .eq("user_id", uid)
    .single();

  if (profErr) return { ok: false as const, status: 500, error: profErr.message };

  const role = (prof?.role ?? "").toLowerCase();
  const isAdmin = !!prof?.is_admin || role === "admin";
  if (isAdmin) return { ok: true as const, uid, course_id: assignment.course_id };

  const { data: ct, error: ctErr } = await supabaseAdmin
    .from("course_teachers")
    .select("id")
    .eq("course_id", assignment.course_id)
    .eq("teacher_id", uid)
    .maybeSingle();

  if (ctErr) return { ok: false as const, status: 500, error: ctErr.message };
  if (!ct || role !== "teacher") return { ok: false as const, status: 403, error: "Not allowed" };

  return { ok: true as const, uid, course_id: assignment.course_id };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const body = await req.json();
    const assignment_id = body?.assignment_id as string | undefined;
    const publish = !!body?.publish;

    if (!assignment_id) return NextResponse.json({ error: "Missing assignment_id" }, { status: 400 });

    const guard = await requireTeacherOrAdmin(token, assignment_id);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const patch: Record<string, any> = {
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("assignments")
      .update(patch)
      .eq("id", assignment_id)
      .select("id, course_id, title, body, status, published_at, due_at, max_score, max_submissions, created_by, created_at, updated_at")
      .single();

    if (upErr || !updated) {
      return NextResponse.json({ error: upErr?.message ?? "Failed to update assignment" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, assignment: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
