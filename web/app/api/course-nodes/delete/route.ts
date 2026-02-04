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

    const { node_id } = await req.json();
    if (!node_id) return NextResponse.json({ error: "Missing node_id" }, { status: 400 });

    const { data: node, error: nodeErr } = await supabaseAdmin
      .from("course_nodes")
      .select("id, course_id, kind, storage_path")
      .eq("id", node_id)
      .single();

    if (nodeErr) return NextResponse.json({ error: nodeErr.message }, { status: 400 });

    const guard = await requireTeacherOrAdminByCourse(token, node.course_id);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    // Delete DB row (cascade deletes children)
    const { error: delErr } = await supabaseAdmin.from("course_nodes").delete().eq("id", node_id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    // Optional cleanup: delete storage object for file (folders have no storage_path)
    // NOTE: cascade deletes child nodes but we are NOT deleting all child storage objects here.
    // We'll add "deep cleanup" later.
    if (node.kind === "file" && node.storage_path) {
      await supabaseAdmin.storage.from("course-files").remove([node.storage_path]);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
