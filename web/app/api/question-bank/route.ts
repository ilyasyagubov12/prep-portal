import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice("Bearer ".length) : null;
}

async function isStaff(user_id: string) {
  const { data: prof } = await supabaseAdmin.from("profiles").select("role, is_admin").eq("user_id", user_id).single();
  const role = (prof?.role ?? "").toLowerCase();
  return !!prof?.is_admin || role === "admin" || role === "teacher";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject");
    const topic = searchParams.get("topic");
    const subtopic = searchParams.get("subtopic");
    const wantCounts = searchParams.get("counts") === "1";
    const token = getBearerToken(req);
    let uid: string | null = null;
    let staff = false;
    if (token) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      uid = userData.user?.id ?? null;
      staff = uid ? await isStaff(uid) : false;
    }

    if (wantCounts) {
      const { data: rows, error: cErr } = await supabaseAdmin
        .from("questions")
        .select("subject, topic, subtopic, published");
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

      const countsMap = new Map<string, number>();
      (rows ?? []).forEach((r: any) => {
        if (!r.published && !staff) return;
        const key = `${r.subject}||${r.topic}||${r.subtopic ?? ""}`;
        countsMap.set(key, (countsMap.get(key) ?? 0) + 1);
      });
      const counts = Array.from(countsMap.entries()).map(([key, count]) => {
        const [s, t, st] = key.split("||");
        return { subject: s, topic: t, subtopic: st || null, count };
      });
      return NextResponse.json({ ok: true, counts }, { status: 200 });
    }

    let query = supabaseAdmin
      .from("questions")
      .select("id, subject, topic, subtopic, stem, passage, explanation, difficulty, image_url, type, published, created_at")
      .order("created_at", { ascending: false });

    if (subject) query = query.eq("subject", subject);
    if (topic) query = query.eq("topic", topic);
    if (subtopic) query = query.eq("subtopic", subtopic);
    if (!staff) query = query.eq("published", true);

    const { data: questions, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const qIds = (questions ?? []).map((q: any) => q.id);
    let choices: any[] = [];
    if (qIds.length) {
      const { data: ch, error: cErr } = await supabaseAdmin
        .from("question_choices")
        .select("id, question_id, label, content, is_correct, order_no")
        .in("question_id", qIds)
        .order("order_no");
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
      choices = ch ?? [];
    }

    const byQ = new Map<string, any[]>();
    choices.forEach((c) => {
      if (!byQ.has(c.question_id)) byQ.set(c.question_id, []);
      byQ.get(c.question_id)!.push(c);
    });

    const result = (questions ?? []).map((q: any) => ({
      ...q,
      choices: byQ.get(q.id) ?? [],
    }));

    return NextResponse.json({ ok: true, questions: result }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;
    if (!(await isStaff(uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { subject, topic, subtopic, stem, passage, explanation, difficulty, image_url, choices } = body ?? {};
    if (!subject || !topic || !stem || !Array.isArray(choices) || choices.length < 2)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // insert question
    const { data: question, error: qErr } = await supabaseAdmin
      .from("questions")
      .insert({
        subject,
        topic,
        subtopic: subtopic || null,
        stem,
        passage: passage || null,
        explanation: explanation || null,
        type: "mcq",
        difficulty: difficulty || null,
        image_url: image_url || null,
        published: true,
        created_by: uid,
      })
      .select()
      .single();
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

    // insert choices
    const mapped = choices.map((c: any, idx: number) => ({
      question_id: question.id,
      label: c.label ?? String.fromCharCode(65 + idx),
      content: c.content,
      is_correct: !!c.is_correct,
      order_no: idx,
    }));
    const { error: cErr } = await supabaseAdmin.from("question_choices").insert(mapped);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, question_id: question.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;
    if (!(await isStaff(uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { question_id } = await req.json();
    if (!question_id) return NextResponse.json({ error: "Missing question_id" }, { status: 400 });

    const { error } = await supabaseAdmin.from("questions").delete().eq("id", question_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    const uid = userData.user.id;
    if (!(await isStaff(uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { question_id, stem, passage, explanation, published, difficulty, image_url, choices } = body ?? {};
    if (!question_id) return NextResponse.json({ error: "Missing question_id" }, { status: 400 });

    const { error: qErr } = await supabaseAdmin
      .from("questions")
      .update({
        stem: stem ?? undefined,
        passage: passage ?? null,
        explanation: explanation ?? null,
        difficulty: difficulty ?? null,
        image_url: image_url ?? null,
        published: published ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", question_id);
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

    if (Array.isArray(choices) && choices.length >= 2) {
      // replace choices
      const { error: delErr } = await supabaseAdmin.from("question_choices").delete().eq("question_id", question_id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
      const mapped = choices.map((c: any, idx: number) => ({
        question_id,
        label: c.label ?? String.fromCharCode(65 + idx),
        content: c.content,
        is_correct: !!c.is_correct,
        order_no: idx,
      }));
      const { error: insErr } = await supabaseAdmin.from("question_choices").insert(mapped);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
