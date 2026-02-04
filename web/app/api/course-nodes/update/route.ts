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

    const { node_id, name, parent_id } = await req.json();

    if (!node_id) return NextResponse.json({ error: "Missing node_id" }, { status: 400 });

    // Load node to know course_id and kind
    const { data: node, error: nodeErr } = await supabaseAdmin
      .from("course_nodes")
      .select("id, course_id, kind")
      .eq("id", node_id)
      .single();

    if (nodeErr) return NextResponse.json({ error: nodeErr.message }, { status: 400 });

    const guard = await requireTeacherOrAdminByCourse(token, node.course_id);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    // If parent_id provided, validate it is a folder in same course (or null)
    if (typeof parent_id !== "undefined" && parent_id !== null) {
      const { data: parent, error: parentErr } = await supabaseAdmin
        .from("course_nodes")
        .select("id, course_id, kind")
        .eq("id", parent_id)
        .single();

      if (parentErr) return NextResponse.json({ error: "Invalid parent folder" }, { status: 400 });
      if (parent.course_id !== node.course_id)
        return NextResponse.json({ error: "Parent must be in same course" }, { status: 400 });
      if (parent.kind !== "folder")
        return NextResponse.json({ error: "Parent must be a folder" }, { status: 400 });
    }

    const updatePayload: any = {};
    if (typeof name === "string") updatePayload.name = name.trim();
    if (typeof parent_id !== "undefined") updatePayload.parent_id = parent_id; // can be null

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("course_nodes")
      .update(updatePayload)
      .eq("id", node_id)
      .select("id, course_id, parent_id, kind, name, description, storage_path, published, created_at")
      .single();

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, node: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
