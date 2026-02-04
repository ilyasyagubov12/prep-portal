import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { course_id } = await req.json();
    if (!course_id) return NextResponse.json({ error: "Missing course_id" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("course_events")
      .select("id, course_id, title, description, starts_at, ends_at, repeat_weekly, repeat_until, created_by, created_at")
      .eq("course_id", course_id)
      .order("starts_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, events: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
