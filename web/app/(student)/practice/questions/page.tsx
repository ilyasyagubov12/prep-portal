"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { mathGroups, verbalGroups, TopicGroup } from "@/lib/questionBank/topics";

function Header({ label, total, gradient }: { label: string; total: number; gradient: string }) {
  return (
    <div
      className={`rounded-3xl px-6 py-5 flex items-center justify-between text-white shadow-xl shadow-black/10 ${gradient} relative overflow-hidden`}
    >
      <div className="absolute inset-0 bg-white/5 backdrop-blur-sm pointer-events-none" />
      <div className="relative">
        <div className="text-xs uppercase tracking-[0.15em] font-semibold text-white/80">Subject</div>
        <div className="text-2xl md:text-3xl font-extrabold leading-tight drop-shadow-sm">{label}</div>
        <div className="mt-1 inline-flex items-center gap-2 text-sm bg-white/15 px-3 py-1.5 rounded-full border border-white/25">
          <span className="inline-block h-2 w-2 rounded-full bg-white" />
          {total.toLocaleString()} questions
        </div>
      </div>
      <button className="relative z-10 px-4 py-2 rounded-full bg-white/85 text-slate-900 text-sm font-semibold shadow-md hover:-translate-y-0.5 transition">
        All topics
      </button>
    </div>
  );
}

function TopicList({
  data,
  basePath,
  showAdd,
  subject,
}: {
  data: TopicGroup[];
  basePath: string;
  showAdd: boolean;
  subject: "verbal" | "math";
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {data.map((t) => (
        <div
          key={t.title}
          className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-lg shadow-indigo-50 px-5 py-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold text-slate-900 text-lg leading-snug">
              <Link href={`${basePath}/${subject}/${encodeURIComponent(t.title)}`} className="hover:text-indigo-600">
                {t.title}
              </Link>
            </div>
            <div className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
              {t.count ? `${t.count.toLocaleString()} q` : "—"}
            </div>
          </div>
          {t.subtopics && (
            <div className="mt-3 grid gap-1.5">
              {t.subtopics.map((s) => (
                <div key={s.title} className="flex items-center justify-between text-sm text-slate-700">
                  <Link
                    href={`${basePath}/${subject}/${encodeURIComponent(t.title)}?subtopic=${encodeURIComponent(s.title)}`}
                    className="inline-flex items-center gap-2 hover:text-indigo-600"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    {s.title}
                  </Link>
                  <span className="text-slate-500">{s.count ? s.count.toLocaleString() : "—"}</span>
                </div>
              ))}
            </div>
          )}
          {showAdd && (
            <div className="mt-4">
              <Link
                href={`/practice/questions/new/${subject}?topic=${encodeURIComponent(t.title)}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                Add question
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Page() {
  const [verbalData, setVerbalData] = useState<TopicGroup[]>(verbalGroups);
  const [mathData, setMathData] = useState<TopicGroup[]>(mathGroups);
  const totalVerbal = useMemo(() => verbalData.reduce((sum, g) => sum + (g.count ?? 0), 0), [verbalData]);
  const totalMath = useMemo(() => mathData.reduce((sum, g) => sum + (g.count ?? 0), 0), [mathData]);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    (async () => {
      const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!access) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${access}` },
      }).catch(() => null);
      if (!res || !res.ok) return;
      const prof = await res.json().catch(() => null);
      const role = (prof?.role ?? "").toLowerCase();
      setIsStaff(!!prof?.is_admin || role === "admin" || role === "teacher");
    })();
  }, []);

  // fetch counts
  useEffect(() => {
    (async () => {
      try {
        const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/counts/`, {
          headers: {
            ...(access ? { Authorization: `Bearer ${access}` } : {}),
          },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load counts");
        const counts: { subject: string; topic: string; subtopic: string | null; count: number }[] = json.counts ?? [];

        const applyCounts = (base: TopicGroup[], subjectKey: string) => {
          return base.map((t) => {
            const topicCount = counts
              .filter((c) => c.subject === subjectKey && c.topic === t.title && !c.subtopic)
              .reduce((s, c) => s + (c.count ?? 0), 0);
            const subtopics = t.subtopics?.map((s) => {
              const c = counts.find((c2) => c2.subject === subjectKey && c2.topic === t.title && c2.subtopic === s.title);
              return { ...s, count: c?.count ?? 0 };
            });
            const subSum = subtopics?.reduce((s, c) => s + (c.count ?? 0), 0) ?? 0;
            const total = topicCount || subSum;
            return { ...t, count: total, subtopics };
          });
        };

        setVerbalData(applyCounts(verbalGroups, "verbal"));
        setMathData(applyCounts(mathGroups, "math"));
      } catch (e) {
        // silent fallback to static zeros
      }
    })();
  }, []);

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-50" />
      <div className="relative p-6 max-w-6xl mx-auto space-y-5">
        {isStaff ? (
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Question bank</h1>
              <p className="text-sm text-slate-600">Browse subjects, drill into topics, or add new questions.</p>
            </div>
            <Link
              href="/practice/questions/manage"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold shadow-md hover:-translate-y-0.5 transition"
            >
              Manage questions
            </Link>
          </div>
        ) : (
          <h1 className="text-2xl font-bold text-slate-900">Question bank</h1>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Header
              label="English"
              total={totalVerbal}
              gradient="bg-gradient-to-r from-[#f59e0b] via-[#f472b6] to-[#8b5cf6]"
            />
            <TopicList data={verbalData} basePath="/practice/questions" subject="verbal" showAdd={isStaff} />
          </div>
          <div className="space-y-3">
            <Header
              label="Math"
              total={totalMath}
              gradient="bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#6d28d9]"
            />
            <TopicList data={mathData} basePath="/practice/questions" subject="math" showAdd={isStaff} />
          </div>
        </div>
      </div>
    </div>
  );
}
