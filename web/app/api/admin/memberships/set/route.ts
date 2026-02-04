import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

async function requireAdmin(token: string) {
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user) return { ok: false as const, status: 401, error: "Invalid token" };

  const uid = userData.user.id;

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("role,is_admin")
    .eq("user_id", uid)
    .maybeSingle();

  if (profErr) return { ok: false as const, status: 500, error: profErr.message };

  const role = (prof?.role ?? "").toLowerCase();
  const isAdmin = !!prof?.is_admin || role === "admin";
  if (!isAdmin) return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, uid };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const guard = await requireAdmin(token);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const body = await req.json();
    const course_id = body?.course_id;
    const kind = body?.kind; // "teacher" | "student"
    const action = body?.action; // "add" | "remove"
    const user_id = body?.user_id;

    if (!course_id) return NextResponse.json({ error: "Missing course_id" }, { status: 400 });
    if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    if (kind !== "teacher" && kind !== "student")
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    if (action !== "add" && action !== "remove")
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    // ✅ STUDENTS -> enrollments
    if (kind === "student") {
      if (action === "add") {
        const { error } = await supabaseAdmin.from("enrollments").insert({
          course_id,
          user_id,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      } else {
        const { error } = await supabaseAdmin
          .from("enrollments")
          .delete()
          .eq("course_id", course_id)
          .eq("user_id", user_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    // ✅ TEACHERS -> course_teachers
    if (kind === "teacher") {
      if (action === "add") {
        const { error } = await supabaseAdmin.from("course_teachers").insert({
          course_id,
          teacher_id: user_id,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      } else {
        const { error } = await supabaseAdmin
          .from("course_teachers")
          .delete()
          .eq("course_id", course_id)
          .eq("teacher_id", user_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
