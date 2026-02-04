import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const assignment_id = searchParams.get("assignment_id");
    if (!assignment_id) return NextResponse.json({ error: "Missing assignment_id" }, { status: 400 });

    // Validate the user (must exist)
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    // Fetch submissions with student nickname (service role bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select(
        "id, assignment_id, student_id, file_path, file_name, file_size, mime_type, created_at, student:profiles!submissions_student_id_fkey(user_id, username, nickname)"
      )
      .eq("assignment_id", assignment_id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, submissions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
