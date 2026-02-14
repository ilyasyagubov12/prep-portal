"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mathGroups, verbalGroups } from "@/lib/questionBank/topics";
import { typesetMath } from "@/lib/mathjax";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type Profile = {
  user_id: string;
  role: string | null;
  is_admin: boolean | null;
  username?: string | null;
  nickname?: string | null;
  email?: string | null;
};

type PracticeModule = {
  id: string;
  subject: "math" | "verbal";
  module_index: number;
  time_limit_minutes: number;
  question_count: number;
  question_ids?: string[] | null;
};

type PracticeAttempt = {
  id: string;
  status: string;
  score: number;
  correct: number;
  total: number;
  completed_at: string | null;
};

type Question = {
  id: string;
  subject: "math" | "verbal";
  topic: string;
  subtopic?: string | null;
  stem: string;
  passage?: string | null;
  choices?: { label: string; content: string }[];
  is_open_ended?: boolean | null;
  image_url?: string | null;
};

function MathContent({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html || "";
    typesetMath(ref.current);
  }, [html]);
  return <span ref={ref} className={className} />;
}

function wrapLatexIfNeeded(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const hasDelims = trimmed.includes("\\(") || trimmed.includes("\\[") || trimmed.includes("$$");
  return hasDelims ? trimmed : `\\(${trimmed}\\)`;
}

type Practice = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  results_published: boolean;
  locked: boolean;
  access_expires_at: string | null;
  modules: PracticeModule[];
  attempt?: PracticeAttempt | null;
};

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role ?? "").toLowerCase();
  return role === "teacher" || role === "admin" || !!p.is_admin;
}

function formatModuleLabel(m: PracticeModule) {
  const label = m.subject === "math" ? "Math" : "Verbal";
  return `${label} Module ${m.module_index}`;
}

export default function Page() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practices, setPractices] = useState<Practice[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [manageId, setManageId] = useState<string | null>(null);
  const [accessUser, setAccessUser] = useState("");
  const [accessExpiry, setAccessExpiry] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) return;
      setAccessToken(token);

      const meRes = await fetch(`${API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!meRes || !meRes.ok) return;
      const me = await meRes.json().catch(() => null);
      if (cancelled || !me) return;
      setProfile({
        user_id: me.user?.id,
        role: me.role ?? null,
        is_admin: me.is_admin ?? false,
        username: me.user?.username ?? null,
        nickname: me.nickname ?? null,
        email: me.user?.email ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadPractices(token: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/list/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load practices");
      setPractices(json.practices ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load practices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    void loadPractices(accessToken);
  }, [accessToken]);

  const canManage = isTeacherOrAdmin(profile);

  async function createPractice() {
    if (!accessToken || !newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/create/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create practice");
      setNewTitle("");
      setNewDesc("");
      await loadPractices(accessToken);
      setManageId(json.practice_id ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create practice");
    } finally {
      setCreating(false);
    }
  }

  async function saveModuleQuestions(practiceId: string, module: PracticeModule, ids: string[]) {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/api/module-practice/modules/set/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        practice_id: practiceId,
        subject: module.subject,
        module_index: module.module_index,
        question_ids: ids,
        question_count: ids.length,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to save module");
    await loadPractices(accessToken);
  }

  async function togglePractice(practiceId: string, payload: Record<string, any>) {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/api/module-practice/update/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ practice_id: practiceId, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to update practice");
    await loadPractices(accessToken);
  }

  async function deletePractice(practiceId: string) {
    if (!accessToken) return;
    const ok = window.confirm("Delete this mock exam? This will remove modules, access, and attempts.");
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/delete/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ practice_id: practiceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to delete");
      await loadPractices(accessToken);
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete");
    }
  }

  async function grantAccess(practiceId: string) {
    if (!accessToken || !accessUser.trim()) return;
    setGrantBusy(true);
    try {
      const payload: any = { practice_id: practiceId };
      if (accessUser.includes("@")) payload.email = accessUser.trim();
      else payload.username = accessUser.trim();
      if (accessExpiry) payload.expires_at = new Date(accessExpiry).toISOString();

      const res = await fetch(`${API_BASE}/api/module-practice/access/grant/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to grant access");
      setAccessUser("");
      setAccessExpiry("");
      await loadPractices(accessToken);
    } catch (e: any) {
      setError(e?.message ?? "Failed to grant access");
    } finally {
      setGrantBusy(false);
    }
  }

  function startPractice(practiceId: string, locked: boolean) {
    if (locked) return;
    router.push(`/practice/modules/${practiceId}`);
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading module practice...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-r from-slate-900 via-blue-900 to-blue-600 text-white p-6 shadow-xl">
          <div className="text-xs uppercase tracking-[0.3em] text-blue-200">Module Practice</div>
          <div className="mt-3 text-3xl font-semibold">SAT Mock Exams</div>
          <div className="mt-2 text-sm text-blue-100">Practice full-length modules with timed sections.</div>
        </header>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {canManage ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-lg font-semibold">Create new mock exam</div>
            <div className="mt-3 grid gap-3 md:grid-cols-[2fr_3fr_auto] items-end">
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Title</span>
                <input
                  className="rounded-xl border px-3 py-2 text-sm"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="SAT Mock Exam - February"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Description</span>
                <input
                  className="rounded-xl border px-3 py-2 text-sm"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Timed practice across all modules"
                />
              </label>
              <button
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={createPractice}
                disabled={creating}
                type="button"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-2">
          {practices.map((p) => (
            <div key={p.id} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Mock exam</div>
                  <div className="mt-2 text-xl font-semibold text-slate-900">{p.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{p.description || "No description"}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {p.locked ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Locked</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Unlocked</span>
                  )}
                  {p.results_published ? (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Results live</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Results hidden</span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {p.modules.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <div className="font-medium">{formatModuleLabel(m)}</div>
                    <div className="text-slate-500">
                      {m.question_count || 0} Q - {m.time_limit_minutes} min
                    </div>
                  </div>
                ))}
              </div>

              {p.attempt ? (
                <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
                  Latest attempt: {Math.round((p.attempt.score ?? 0) * 100)}% ({p.attempt.correct}/
                  {p.attempt.total})
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  onClick={() => startPractice(p.id, p.locked)}
                  disabled={p.locked}
                  type="button"
                >
                  Start mock exam
                </button>
                {canManage ? (
                  <button
                    className="rounded-xl border px-3 py-2 text-sm"
                    onClick={() => setManageId(manageId === p.id ? null : p.id)}
                    type="button"
                  >
                    {manageId === p.id ? "Close" : "Manage"}
                  </button>
                ) : null}
              </div>

              {canManage && manageId === p.id ? (
                <div className="mt-5 space-y-4 border-t pt-4">
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-lg border px-3 py-2 text-xs font-semibold"
                      type="button"
                      onClick={() => togglePractice(p.id, { results_published: !p.results_published })}
                    >
                      {p.results_published ? "Hide results" : "Publish results"}
                    </button>
                    <button
                      className="rounded-lg border px-3 py-2 text-xs font-semibold"
                      type="button"
                      onClick={() => togglePractice(p.id, { is_active: !p.is_active })}
                    >
                      {p.is_active ? "Disable access" : "Enable access"}
                    </button>
                    <button
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                      type="button"
                      onClick={() => deletePractice(p.id)}
                    >
                      Delete mock
                    </button>
                  </div>

                  <div className="space-y-3">
                    {p.modules.map((m) => (
                      <ModuleEditor
                        key={m.id}
                        practiceId={p.id}
                        module={m}
                        onSave={saveModuleQuestions}
                        token={accessToken}
                      />
                    ))}
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Grant access
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-[1.2fr_1fr_auto]">
                      <input
                        className="rounded-lg border px-3 py-2 text-sm"
                        value={accessUser}
                        onChange={(e) => setAccessUser(e.target.value)}
                        placeholder="Student email or username"
                      />
                      <input
                        type="date"
                        className="rounded-lg border px-3 py-2 text-sm"
                        value={accessExpiry}
                        onChange={(e) => setAccessExpiry(e.target.value)}
                      />
                      <button
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        onClick={() => grantAccess(p.id)}
                        disabled={grantBusy}
                        type="button"
                      >
                        {grantBusy ? "Granting..." : "Grant"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function ModuleEditor({
  practiceId,
  module,
  onSave,
  token,
}: {
  practiceId: string;
  module: PracticeModule;
  onSave: (practiceId: string, module: PracticeModule, ids: string[]) => Promise<void>;
  token: string | null;
}) {
  const idsKey = (module.question_ids || []).join("|");
  const [selectedIds, setSelectedIds] = useState<string[]>(module.question_ids || []);
  const [selectedMap, setSelectedMap] = useState<Record<string, Question>>({});
  const [newId, setNewId] = useState("");
  const [topic, setTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<Record<string, boolean>>({});

  const groups = module.subject === "math" ? mathGroups : verbalGroups;
  const subtopics = useMemo(() => {
    const group = groups.find((g) => g.title === topic);
    return group?.subtopics ?? [];
  }, [groups, topic]);

  useEffect(() => {
    setSelectedIds(module.question_ids || []);
  }, [module.id, idsKey]);

  useEffect(() => {
    if (!token) return;
    const ids = module.question_ids || [];
    if (!ids.length) {
      setSelectedMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fetched = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`${API_BASE}/api/questions/${id}/`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json?.question ?? null;
          })
        );
        if (cancelled) return;
        const map: Record<string, Question> = {};
        for (const q of fetched) {
          if (q?.id) map[q.id] = q;
        }
        setSelectedMap(map);
      } catch {
        if (!cancelled) setSelectedMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [module.id, token, idsKey]);

  const filteredResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return results;
    return results.filter((q) => {
      const stem = (q.stem || "").toLowerCase();
      return q.id.toLowerCase().includes(term) || stem.includes(term);
    });
  }, [results, search]);

  function togglePreview(id: string) {
    setOpenPreview((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function QuestionPreview({ question }: { question: Question }) {
    const isMath = module.subject === "math";
    const imageUrl = question.image_url;
    const resolvedImageUrl =
      imageUrl && imageUrl.startsWith("/") ? `${API_BASE}${imageUrl}` : imageUrl;
    const stemHtml = (isMath ? wrapLatexIfNeeded(question.stem || "") : question.stem || "").replace(/\n/g, "<br/>");
    const passageHtml = (question.passage || "").replace(/\n/g, "<br/>");

    if (isMath) {
      return (
        <div className="space-y-3">
          {resolvedImageUrl ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolvedImageUrl} alt="question" className="w-full max-h-[220px] object-contain" />
            </div>
          ) : null}
          <div className="text-sm font-semibold text-slate-900">
            <MathContent html={stemHtml} />
          </div>
          {question.is_open_ended ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
              Open-ended response
            </div>
          ) : (
            <div className="space-y-2">
              {(question.choices || []).map((c) => (
                <div key={c.label} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-slate-300 text-[10px] font-semibold mr-2">
                    {c.label}
                  </span>
                  <MathContent html={wrapLatexIfNeeded(c.content || "").replace(/\n/g, "<br/>")} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Reading passage</div>
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
            {resolvedImageUrl ? (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolvedImageUrl} alt="question" className="w-full max-h-[200px] object-contain" />
              </div>
            ) : null}
            {question.passage ? (
              <span dangerouslySetInnerHTML={{ __html: passageHtml }} />
            ) : (
              <span className="text-slate-400">No passage.</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Question</div>
          <div className="mt-2 text-xs font-semibold text-slate-900">
            <span dangerouslySetInnerHTML={{ __html: stemHtml }} />
          </div>
          {question.is_open_ended ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
              Open-ended response
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {(question.choices || []).map((c) => (
                <div key={c.label} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-slate-300 text-[10px] font-semibold mr-2">
                    {c.label}
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: (c.content || "").replace(/\n/g, "<br/>") }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function addQuestionById(id: string) {
    const clean = id.trim();
    if (!clean) return;
    setSelectedIds((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
  }

  async function handleAddId() {
    const clean = newId.trim();
    if (!clean) return;
    if (selectedIds.includes(clean)) {
      setNewId("");
      return;
    }
    addQuestionById(clean);
    setNewId("");
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/questions/${clean}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json?.question?.id) {
      setSelectedMap((prev) => ({ ...prev, [json.question.id]: json.question }));
    }
  }

  function handleAddQuestion(q: Question) {
    if (selectedIds.includes(q.id)) return;
    setSelectedIds((prev) => [...prev, q.id]);
    setSelectedMap((prev) => ({ ...prev, [q.id]: q }));
  }

  function handleRemove(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  async function handleSearch() {
    if (!token) return;
    setLoadingResults(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("subject", module.subject);
      if (topic) params.set("topic", topic);
      if (subtopic) params.set("subtopic", subtopic);
      params.set("limit", "50");
      const res = await fetch(`${API_BASE}/api/questions/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load questions");
      setResults(json.questions ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load questions");
    } finally {
      setLoadingResults(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    try {
      await onSave(practiceId, module, selectedIds);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Module</div>
          <div className="text-sm font-semibold text-slate-900">
            {module.subject.toUpperCase()} module {module.module_index}
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {selectedIds.length} questions · {module.time_limit_minutes} min
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Add by ID</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="flex-1 min-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder="Paste question ID"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
          />
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            type="button"
            onClick={handleAddId}
          >
            Add
          </button>
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            type="button"
            onClick={() => setSelectedIds([])}
          >
            Clear list
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Selected questions</div>
        <div className="mt-2 grid gap-2">
          {selectedIds.length ? (
            selectedIds.map((id, idx) => {
              const q = selectedMap[id];
              return (
                <div key={id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      {q ? `${q.topic}${q.subtopic ? ` · ${q.subtopic}` : ""}` : "Question"}
                    </div>
                    <div className="flex items-center gap-2">
                      {q ? (
                        <button
                          className="text-[11px] font-semibold text-slate-600"
                          onClick={() => togglePreview(id)}
                        >
                          {openPreview[id] ? "Hide" : "Preview"}
                        </button>
                      ) : null}
                      <button className="text-[11px] font-semibold text-red-600" onClick={() => handleRemove(id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-700 line-clamp-2">
                    {q ? (
                      <span dangerouslySetInnerHTML={{ __html: q.stem }} />
                    ) : (
                      <span>{id}</span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">#{idx + 1}</div>
                  {q && openPreview[id] ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                      <QuestionPreview question={q} />
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
              No questions selected yet.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Question bank</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setSubtopic("");
            }}
          >
            <option value="">All topics</option>
            {groups.map((g) => (
              <option key={g.title} value={g.title}>
                {g.title}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            value={subtopic}
            onChange={(e) => setSubtopic(e.target.value)}
            disabled={!topic}
          >
            <option value="">All subtopics</option>
            {subtopics.map((s) => (
              <option key={s.title} value={s.title}>
                {s.title}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            placeholder="Search stem or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            type="button"
            onClick={handleSearch}
            disabled={loadingResults}
          >
            {loadingResults ? "Loading..." : "Load questions"}
          </button>
          {err ? <div className="text-xs text-red-600">{err}</div> : null}
        </div>
        <div className="mt-3 grid gap-2">
          {filteredResults.map((q) => {
            const added = selectedIds.includes(q.id);
            return (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-[0.12em]">
                    {q.subject} · {q.topic}
                    {q.subtopic ? ` · ${q.subtopic}` : ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-[11px] font-semibold text-slate-600"
                      onClick={() => togglePreview(q.id)}
                    >
                      {openPreview[q.id] ? "Hide" : "Preview"}
                    </button>
                    <button
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${
                        added ? "border-slate-200 text-slate-400" : "border-slate-300 text-slate-700"
                      }`}
                      onClick={() => handleAddQuestion(q)}
                      disabled={added}
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  </div>
                </div>
                <div className="text-xs text-neutral-900 line-clamp-2" dangerouslySetInnerHTML={{ __html: q.stem }} />
                <div className="text-[10px] text-slate-400">{q.id}</div>
                {openPreview[q.id] ? (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <QuestionPreview question={q} />
                  </div>
                ) : null}
              </div>
            );
          })}
          {!filteredResults.length && !loadingResults ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
              No questions loaded.
            </div>
          ) : null}
        </div>
      </div>

      <button
        className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        onClick={handleSave}
        type="button"
        disabled={busy}
      >
        {busy ? "Saving..." : "Save module"}
      </button>
    </div>
  );
}
