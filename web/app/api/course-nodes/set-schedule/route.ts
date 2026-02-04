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
  if (isAdmin) return { ok: true as const };

  const { data: ct, error: ctErr } = await supabaseAdmin
    .from("course_teachers")
    .select("id")
    .eq("course_id", course_id)
    .eq("teacher_id", uid)
    .maybeSingle();

  if (ctErr) return { ok: false as const, status: 500, error: ctErr.message };
  if (!ct || role !== "teacher") return { ok: false as const, status: 403, error: "Not allowed" };

  return { ok: true as const };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const { node_id, publish_at, unpublish_at } = await req.json();
    if (!node_id) return NextResponse.json({ error: "Missing node_id" }, { status: 400 });

    const { data: node, error: nodeErr } = await supabaseAdmin
      .from("course_nodes")
      .select("id, course_id, kind")
      .eq("id", node_id)
      .single();

    if (nodeErr) return NextResponse.json({ error: nodeErr.message }, { status: 400 });
    if (node.kind !== "file" && node.kind !== "folder") {
      return NextResponse.json({ error: "Only files/folders can be scheduled" }, { status: 400 });
    }

    const guard = await requireTeacherOrAdminByCourse(token, node.course_id);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const payload: any = {
      publish_at: publish_at ?? null,
      unpublish_at: unpublish_at ?? null,
    };

    // sanity if both set
    if (payload.publish_at && payload.unpublish_at) {
      const a = new Date(payload.publish_at).getTime();
      const b = new Date(payload.unpublish_at).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
        return NextResponse.json({ error: "unpublish_at must be after publish_at" }, { status: 400 });
      }
    }

    // ✅ scheduling should not also mean “published”
    if (payload.publish_at || payload.unpublish_at) {
      payload.published = false;
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("course_nodes")
      .update(payload)
      .eq("id", node_id)
      .select("id, published, publish_at, unpublish_at")
      .single();

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, node: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
