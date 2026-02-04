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

    const { node_id } = await req.json();
    if (!node_id) return NextResponse.json({ error: "Missing node_id" }, { status: 400 });

    // auth check
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;

    // load node
    const { data: node, error: nodeErr } = await supabaseAdmin
      .from("course_nodes")
      .select("id, course_id, created_by, kind")
      .eq("id", node_id)
      .single();

    if (nodeErr) return NextResponse.json({ error: nodeErr.message }, { status: 400 });
    if (node.kind !== "file") return NextResponse.json({ error: "Only file nodes can be confirmed" }, { status: 400 });

    // admin check
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role,is_admin")
      .eq("user_id", uid)
      .single();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

    const role = (prof?.role ?? "").toLowerCase();
    const isAdmin = !!prof?.is_admin || role === "admin";

    if (!isAdmin) {
      // teacher must be creator + assigned to course
      if (node.created_by !== uid) return NextResponse.json({ error: "Only uploader can confirm" }, { status: 403 });

      const { data: ct, error: ctErr } = await supabaseAdmin
        .from("course_teachers")
        .select("id")
        .eq("course_id", node.course_id)
        .eq("teacher_id", uid)
        .maybeSingle();

      if (ctErr) return NextResponse.json({ error: ctErr.message }, { status: 500 });
      if (!ct || role !== "teacher") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    // publish
    const { data, error } = await supabaseAdmin
      .from("course_nodes")
      .update({ published: false })
      .eq("id", node_id)
      .select("id, published")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, node: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
