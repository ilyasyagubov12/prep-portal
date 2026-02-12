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
        <div className="mt-2 inline-flex items-center gap-2 text-sm bg-white/15 px-3 py-1.5 rounded-full border border-white/25">
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

type ProgressState = {
  completedSubtopics: Set<string>;
  completedTopics: Set<string>;
  effectiveLevel: number;
  lockedTopics: Set<string>;
  indexMap: Map<string, number>;
  topicQuizReady: Set<string>;
};

function TopicList({
  data,
  basePath,
  showAdd,
  subject,
  progress,
  gateEnabled,
}: {
  data: TopicGroup[];
  basePath: string;
  showAdd: boolean;
  subject: "verbal" | "math";
  progress: ProgressState;
  gateEnabled: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {data.map((t) => (
        <div
          key={t.title}
          className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-lg shadow-indigo-50 px-5 py-4 hover:shadow-xl transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold text-slate-900 text-lg leading-snug">
              <Link href={`${basePath}/${subject}/${encodeURIComponent(t.title)}`} className="hover:text-indigo-600">
                {t.title}
              </Link>
            </div>
            <div className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
              {t.count ? `${t.count.toLocaleString()} q` : "--"}
            </div>
          </div>
          {t.subtopics && (
            <div className="mt-4 grid gap-2">
              {t.subtopics.map((s) => {
                const key = `${t.title}::${s.title}`;
                const idx = progress.indexMap.get(key) ?? 0;
                const topicLocked = gateEnabled && progress.lockedTopics.has(t.title);
                const completed = progress.completedSubtopics.has(key);
                const unlocked = completed || (!topicLocked && (!gateEnabled || progress.effectiveLevel >= idx));

                return (
                  <div
                    key={s.title}
                    className={`flex items-center justify-between text-sm rounded-xl px-3 py-2 border ${
                      unlocked ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-white text-slate-400 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${unlocked ? "bg-indigo-400" : "bg-slate-300"}`}
                      />
                      {unlocked ? (
                        <Link
                          href={`${basePath}/${subject}/${encodeURIComponent(t.title)}?subtopic=${encodeURIComponent(
                            s.title
                          )}`}
                          className="inline-flex items-center gap-2 hover:text-indigo-600"
                        >
                          {s.title}
                        </Link>
                      ) : (
                        <span className="text-slate-400">{s.title}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {completed ? (
                        <Link
                          href={`/practice/questions/quiz?subject=${subject}&topic=${encodeURIComponent(
                            t.title
                          )}&subtopic=${encodeURIComponent(s.title)}`}
                          className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                        >
                          Retake quiz ✓
                        </Link>
                      ) : unlocked ? (
                        <Link
                          href={`/practice/questions/quiz?subject=${subject}&topic=${encodeURIComponent(
                            t.title
                          )}&subtopic=${encodeURIComponent(s.title)}`}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          Take quiz
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">Locked</span>
                      )}
                      <span className="text-slate-500">{s.count ? s.count.toLocaleString() : "--"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!progress.lockedTopics.has(t.title) && t.subtopics && t.subtopics.length > 0 ? (
            <div className="mt-3">
              <Link
                href={`/practice/questions/quiz?subject=${subject}&topic=${encodeURIComponent(t.title)}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                {progress.completedTopics.has(t.title) ? `Retake ${t.title} quiz` : `Take ${t.title} quiz`}
              </Link>
            </div>
          ) : null}
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
  const [levels, setLevels] = useState({ math: 0, verbal: 0 });
  const [progress, setProgress] = useState({ subtopics: new Set<string>(), topics: new Set<string>() });

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
      const mathLevel = parseInt(prof?.math_level ?? "0", 10);
      const verbalLevel = parseInt(prof?.verbal_level ?? "0", 10);
      setLevels({
        math: Number.isFinite(mathLevel) ? mathLevel : 0,
        verbal: Number.isFinite(verbalLevel) ? verbalLevel : 0,
      });
    })();
  }, []);

  // fetch progress + counts
  useEffect(() => {
    (async () => {
      try {
        const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!access) return;

        const prog = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/progress/`, {
          headers: { Authorization: `Bearer ${access}` },
        });
        const progJson = await prog.json().catch(() => null);
        if (prog.ok && progJson) {
          const sub = new Set<string>();
          const top = new Set<string>();
          (progJson.subtopics ?? []).forEach((s: any) => {
            if (s?.passed) sub.add(`${s.topic}::${s.subtopic}`);
          });
          (progJson.topics ?? []).forEach((t: any) => {
            if (t?.passed) top.add(t.topic);
          });
          setProgress({ subtopics: sub, topics: top });
        }

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
        // silent fallback
      }
    })();
  }, []);

  const buildProgressState = (subject: "math" | "verbal", data: TopicGroup[]): ProgressState => {
    const order: string[] = [];
    data.forEach((t) => t.subtopics?.forEach((s) => order.push(`${t.title}::${s.title}`)));
    const indexMap = new Map<string, number>();
    order.forEach((k, idx) => indexMap.set(k, idx));
    const completedCount = [...progress.subtopics].filter((k) => indexMap.has(k)).length;
    const baseLevel = subject === "math" ? levels.math : levels.verbal;
    const effectiveLevel = Math.max(baseLevel, completedCount);

    const derivedCompletedSubtopics = new Set<string>(progress.subtopics);
    const completionCap = Math.max(baseLevel, completedCount);
    order.forEach((k, idx) => {
      if (idx < completionCap) derivedCompletedSubtopics.add(k);
    });

    const derivedCompletedTopics = new Set<string>(progress.topics);
    data.forEach((t) => {
      const sub = t.subtopics ?? [];
      if (!sub.length) return;
      const allDone = sub.every((s) => derivedCompletedSubtopics.has(`${t.title}::${s.title}`));
      if (allDone) derivedCompletedTopics.add(t.title);
    });

    const lockedTopics = new Set<string>();
    data.forEach((t, idx) => {
      if (idx === 0) return;
      const prev = data[idx - 1];
      if (!derivedCompletedTopics.has(prev.title)) lockedTopics.add(t.title);
    });

    const topicQuizReady = new Set<string>();
    data.forEach((t) => {
      const sub = t.subtopics ?? [];
      if (!sub.length) return;
      const allDone = sub.every((s) => derivedCompletedSubtopics.has(`${t.title}::${s.title}`));
      if (allDone && !derivedCompletedTopics.has(t.title)) topicQuizReady.add(t.title);
    });

    return {
      completedSubtopics: derivedCompletedSubtopics,
      completedTopics: derivedCompletedTopics,
      effectiveLevel,
      lockedTopics,
      indexMap,
      topicQuizReady,
    };
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-50" />
      <div className="relative p-6 max-w-6xl mx-auto space-y-5">
        {isStaff ? (
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Question bank</h1>
              <p className="text-sm text-slate-600">Browse subjects, drill into topics, or take quizzes.</p>
            </div>
            <Link
              href="/practice/questions/manage"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold shadow-md hover:-translate-y-0.5 transition"
            >
              Manage questions
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">Question bank</h1>
            <p className="text-sm text-slate-600">Follow your level path and unlock new topics.</p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Header
              label="English"
              total={totalVerbal}
              gradient="bg-gradient-to-r from-[#f59e0b] via-[#f472b6] to-[#8b5cf6]"
            />
            <TopicList
              data={verbalData}
              basePath="/practice/questions"
              subject="verbal"
              showAdd={isStaff}
              progress={buildProgressState("verbal", verbalData)}
              gateEnabled={!isStaff}
            />
          </div>
          <div className="space-y-3">
            <Header
              label="Math"
              total={totalMath}
              gradient="bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#6d28d9]"
            />
            <TopicList
              data={mathData}
              basePath="/practice/questions"
              subject="math"
              showAdd={isStaff}
              progress={buildProgressState("math", mathData)}
              gateEnabled={!isStaff}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
