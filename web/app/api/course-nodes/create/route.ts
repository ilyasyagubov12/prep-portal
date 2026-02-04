import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

function safeFileName(name: string) {
  return name.replaceAll(" ", "_").replaceAll("/", "_");
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
    const {
      course_id,
      parent_id,
      kind,
      name,
      description,
      original_filename,
      mime_type,
      size_bytes,
    } = body ?? {};

    if (!course_id || !kind || !name) {
      return NextResponse.json({ error: "Missing course_id/kind/name" }, { status: 400 });
    }
    if (kind !== "folder" && kind !== "file") {
      return NextResponse.json({ error: "kind must be folder or file" }, { status: 400 });
    }

    const guard = await requireTeacherOrAdmin(token, course_id);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    // ✅ FOLDER
    if (kind === "folder") {
      const { data, error } = await supabaseAdmin
        .from("course_nodes")
        .insert({
          course_id,
          parent_id: parent_id ?? null,
          kind: "folder",
          name: String(name).trim(),
          description: description?.trim?.() ? description.trim() : null,
          storage_path: null,
          mime_type: null,
          size_bytes: null,
          published: true,
          created_by: guard.uid,
        })
        .select("id, course_id, parent_id, kind, name, description, published, created_at")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, node: data }, { status: 200 });
    }

    // ✅ FILE NODE (published=false until confirm)
    const filename = safeFileName(String(original_filename || name || "file"));
    const placeholder = `${course_id}/${guard.uid}/temp/${Date.now()}-${filename}`;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("course_nodes")
      .insert({
        course_id,
        parent_id: parent_id ?? null,
        kind: "file",
        name: String(name).trim(),
        description: description?.trim?.() ? description.trim() : null,
        storage_path: placeholder,
        mime_type: mime_type ?? null,
        size_bytes: typeof size_bytes === "number" ? size_bytes : null,
        published: false,
        created_by: guard.uid,
      })
      .select("id")
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    const node_id = inserted.id as string;
    const storage_path = `${course_id}/${guard.uid}/${node_id}/${Date.now()}-${filename}`;

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("course_nodes")
      .update({ storage_path })
      .eq("id", node_id)
      .select("id, course_id, parent_id, kind, name, description, storage_path, published, created_at")
      .single();

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, node: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
