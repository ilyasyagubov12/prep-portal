import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    // 1) Read bearer token from Authorization header
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json(
        { error: "Missing Bearer token" },
        { status: 401 }
      );
    }

    // 2) Verify token -> get user
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);

    if (userErr || !userData.user) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // 3) Check admin flag
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("user_id", userId)
      .single();

    if (profileErr) {
      return NextResponse.json(
        { error: profileErr.message },
        { status: 500 }
      );
    }

    if (!profile?.is_admin) {
      return NextResponse.json(
        { error: "Not admin" },
        { status: 403 }
      );
    }

    // 4) Read payload
    const body = await req.json();
    const slug = String(body.slug || "").trim();
    const title = String(body.title || "").trim();
    const description = body.description
      ? String(body.description)
      : null;

    if (!slug || !title) {
      return NextResponse.json(
        { error: "slug and title are required" },
        { status: 400 }
      );
    }

    // 5) Insert course safely (handle duplicates)
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("courses")
      .upsert(
        { slug, title, description },
        { onConflict: "slug", ignoreDuplicates: true }
      )
      .select("id, slug, title, description")
      .single();

    if (insertErr) {
      // If already exists, fetch existing course
      const { data: existing, error: existingErr } = await supabaseAdmin
        .from("courses")
        .select("id, slug, title, description")
        .eq("slug", slug)
        .single();

      if (existingErr) {
        return NextResponse.json(
          { error: insertErr.message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          course: existing,
          note: "Course already existed",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ok: true, course: inserted },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
