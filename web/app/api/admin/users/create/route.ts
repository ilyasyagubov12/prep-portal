import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Role = "student" | "teacher" | "admin";

export async function POST(req: Request) {
  try {
    // 1) Bearer token (admin session)
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    }

    // 2) Verify token -> admin user
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const adminId = userData.user.id;

    // 3) Check admin flag
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

    // 4) Payload (USERNAME + password)
    const body = await req.json();

    const usernameRaw = String(body.username || "").trim();
    const password = String(body.password || "");
    const nickname = body.nickname ? String(body.nickname).trim() : null;

    const role = (String(body.role || "student").trim().toLowerCase() as Role) || "student";

    // Normalize username
    const username = usernameRaw.toLowerCase();

    if (!username || !password) {
      return NextResponse.json(
        { error: "username and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "password must be at least 6 characters" },
        { status: 400 }
      );
    }

    if (!["student", "teacher", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "role must be student | teacher | admin" },
        { status: 400 }
      );
    }

    // Hidden internal email (never shown to user)
    const email = `${username}@prep.local`;

    // 5) Create auth user (service role)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // dev convenience
    });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Create user failed" },
        { status: 400 }
      );
    }

    const newUserId = created.user.id;

    // 6) Upsert profile (single upsert only)
    const is_admin = role === "admin";

    const { error: upsertErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: newUserId,
          username,
          nickname: nickname ?? usernameRaw, // display name defaults to what admin typed
          avatar_url: null,
          is_admin,
          role,
        },
        { onConflict: "user_id" }
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    // 7) Return saved profile
    const { data: savedProfile, error: readErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, username, nickname, role, is_admin")
      .eq("user_id", newUserId)
      .single();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        user: { id: newUserId, username }, // don’t return email to keep UX “username-only”
        profile: savedProfile,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
