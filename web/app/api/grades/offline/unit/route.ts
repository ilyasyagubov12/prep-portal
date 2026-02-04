import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

async function isStaff(course_id: string, user_id: string) {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("user_id", user_id)
    .single();
  if (prof?.is_admin) return true;
  const role = (prof?.role ?? "").toLowerCase();
  if (role === "admin" || role === "teacher") return true;
  const { data: ct } = await supabaseAdmin
    .from("course_teachers")
    .select("id")
    .eq("course_id", course_id)
    .eq("teacher_id", user_id)
    .maybeSingle();
  return !!ct;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    const body = await req.json();
    const { course_id, title, max_score, unit_id, publish_at } = body ?? {};
    if (!course_id || !title) return NextResponse.json({ error: "Missing course_id or title" }, { status: 400 });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;
    if (!(await isStaff(course_id, uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Update if unit_id provided, otherwise create
    if (unit_id) {
      const { data, error } = await supabaseAdmin
        .from("offline_grade_units")
        .update({ title, max_score: max_score ?? null, publish_at: publish_at ?? null })
        .eq("id", unit_id)
        .eq("course_id", course_id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, unit: data });
    } else {
      const { data, error } = await supabaseAdmin
        .from("offline_grade_units")
        .insert({ course_id, title, max_score: max_score ?? null, publish_at: publish_at ?? null })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, unit: data });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    const body = await req.json();
    const { course_id, unit_id } = body ?? {};
    if (!course_id || !unit_id) return NextResponse.json({ error: "Missing course_id or unit_id" }, { status: 400 });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;
    if (!(await isStaff(course_id, uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await supabaseAdmin
      .from("offline_grade_units")
      .delete()
      .eq("id", unit_id)
      .eq("course_id", course_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
