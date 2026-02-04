"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_path?: string | null;
  cover_url?: string | null; // optional absolute url from API
};

export default function CoursesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const access =
        typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!access) {
        if (!cancelled) {
          setError("Not logged in.");
          setLoading(false);
        }
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/courses/`, {
        headers: {
          Authorization: `Bearer ${access}`,
        },
      }).catch(() => null);

      if (cancelled) return;

      if (!res || !res.ok) {
        setError("Courses API unavailable yet.");
        setCourses([]);
        setLoading(false);
        return;
      }

      const data = (await res.json().catch(() => [])) as Course[];
      const base = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
      const mapped = (data || []).map((c) => ({
        ...c,
        cover_url:
          c.cover_url ||
          (c.cover_path ? `${base}/media/${c.cover_path}` : null),
      }));
      setCourses(mapped);
      setLoading(false);
    })().catch((err) => {
      if (!cancelled) {
        setError(err?.message ?? "Failed to load courses");
        setCourses([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    // basic safe sort (optional)
    return [...courses].sort((a, b) => a.title.localeCompare(b.title));
  }, [courses]);

  if (loading)
    return (
      <div className="p-6 space-y-3">
        <div className="h-10 w-48 rounded-lg bg-slate-200 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border bg-white shadow-sm overflow-hidden animate-pulse"
            >
              <div className="h-36 bg-slate-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-2/3 bg-slate-200 rounded" />
                <div className="h-4 w-1/2 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  if (error)
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      </div>
    );

  return (
    <div className="p-4 space-y-5">
      <div className="rounded-3xl border bg-white shadow-lg p-6 flex items-center justify-between gap-4 flex-wrap relative overflow-hidden">
        <div className="absolute -left-10 -top-10 h-40 w-40 bg-gradient-to-br from-sky-500 to-indigo-500 blur-3xl opacity-40" />
        <div className="absolute right-0 top-1/2 h-32 w-32 bg-gradient-to-br from-emerald-400 to-cyan-500 blur-3xl opacity-40" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-600">Dashboard</div>
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">My Courses</h1>
          <p className="text-sm text-neutral-600">Only courses you are assigned to are shown.</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-sm text-neutral-500 bg-white">
          No courses found.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((c) => {
            const img = c.cover_url || c.cover_path || null;

            return (
              <Link
                key={c.id}
                href={`/courses/${c.slug}`}
                className="group relative rounded-3xl border bg-white shadow-sm overflow-hidden transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                <div className="relative h-48 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt="cover"
                      className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm text-neutral-300">
                      No cover image
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1">
                    <div className="text-white text-lg font-semibold line-clamp-1">{c.title}</div>
                    <div className="text-sm text-white/80 line-clamp-2">{c.description ?? "No description"}</div>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between text-xs text-neutral-600">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    View course
                  </span>
                  <span className="text-slate-400 group-hover:text-slate-700 transition">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
