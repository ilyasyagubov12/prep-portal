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
    const course_id = body?.course_id;
    const parent_id = body?.parent_id ?? null;
    const title = String(body?.title ?? "").trim();
    const assignment_body = body?.body ?? null;
    const due_at = body?.due_at ?? null;
    const max_score = typeof body?.max_score === "number" ? body.max_score : null;
    const max_submissions = typeof body?.max_submissions === "number" ? body.max_submissions : null;

    if (!course_id || !title) {
      return NextResponse.json({ error: "Missing course_id or title" }, { status: 400 });
    }

    const guard = await requireTeacherOrAdmin(token, course_id);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { data: assignment, error: aErr } = await supabaseAdmin
      .from("assignments")
      .insert({
        course_id,
        title,
        body: assignment_body,
        status: "draft",
        published_at: null,
        due_at,
        max_score,
        max_submissions,
        created_by: guard.uid,
      })
      .select(
        "id, course_id, title, body, status, published_at, due_at, max_score, max_submissions, created_by, created_at, updated_at"
      )
      .single();

    if (aErr || !assignment) {
      return NextResponse.json({ error: aErr?.message ?? "Failed to create assignment" }, { status: 400 });
    }

    const { data: node, error: nErr } = await supabaseAdmin
      .from("course_nodes")
      .insert({
        course_id,
        parent_id,
        kind: "assignment",
        name: title,
        description: null,
        assignment_id: assignment.id,
        storage_path: null,
        mime_type: null,
        size_bytes: null,
        published: true,
        publish_at: null,
        created_by: guard.uid,
      })
      .select("id, course_id, parent_id, kind, name, assignment_id")
      .single();

    if (nErr) {
      // rollback the orphan assignment to keep single source of truth
      await supabaseAdmin.from("assignments").delete().eq("id", assignment.id);
      return NextResponse.json({ error: nErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, assignment, node }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
