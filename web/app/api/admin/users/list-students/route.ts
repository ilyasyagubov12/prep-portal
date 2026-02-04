import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    // 1) Bearer token
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    }

    // 2) Verify token
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const adminId = userData.user.id;

    // 3) Check admin
    const { data: adminProfile, error: adminProfileErr } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("user_id", adminId)
      .single();

    if (adminProfileErr) {
      return NextResponse.json({ error: adminProfileErr.message }, { status: 500 });
    }
    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: "Not admin" }, { status: 403 });
    }

    // 4) Return students
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id, username, nickname, role")
      .eq("role", "student")
      .order("username", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, students: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
