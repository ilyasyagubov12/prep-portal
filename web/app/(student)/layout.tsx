"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ClipboardList, Home, Menu, SpellCheck } from "lucide-react";
import Sidebar from "./sidebar";

export default function StudentLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [requireOpen, setRequireOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    nickname: "",
    phone_number: "",
    parent_name: "",
    parent_phone: "",
  });

  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("access_token");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (cancelled) return;

      if (!res || !res.ok) {
        router.replace("/login");
        return;
      }

      const data = await res.json().catch(() => null);
      if (cancelled) return;
      const missingRequired =
        !data?.user?.first_name?.trim?.() ||
        !data?.user?.last_name?.trim?.() ||
        !data?.phone_number?.trim?.() ||
        !data?.parent_name?.trim?.() ||
        !data?.parent_phone?.trim?.();

      setForm({
        first_name: data?.user?.first_name || "",
        last_name: data?.user?.last_name || "",
        nickname: data?.nickname || "",
        phone_number: data?.phone_number || "",
        parent_name: data?.parent_name || "",
        parent_phone: data?.parent_phone || "",
      });

      setRequireOpen(missingRequired);
      setChecking(false);
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router, token]);

  async function saveRequiredProfile() {
    if (!token) {
      setSaveError("No session. Please log in again.");
      return;
    }

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      nickname: form.nickname.trim() || null,
      phone_number: form.phone_number.trim(),
      parent_name: form.parent_name.trim(),
      parent_phone: form.parent_phone.trim(),
    };

    if (
      !payload.first_name ||
      !payload.last_name ||
      !payload.phone_number ||
      !payload.parent_name ||
      !payload.parent_phone
    ) {
      setSaveError("Please fill all required fields.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/profile/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || json?.error) {
      setSaveError(json?.error || "Unable to save profile.");
      setSaving(false);
      return;
    }

    setRequireOpen(false);
    setSaving(false);
  }

  if (checking) {
    return (
      <div style={{ padding: 24, color: "#aaa" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen md:flex">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen ? (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-6">
        {children}
      </main>
      {/* Mobile bottom navigation */}
      <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="mx-3 mb-3 rounded-2xl border border-slate-200 bg-white/95 px-2 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.18)] backdrop-blur">
          <div className="grid grid-cols-5 items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
            >
              <Menu size={18} />
              Menu
            </button>

            <button
              type="button"
              onClick={() => router.push("/courses")}
              className={[
                "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold",
                pathname?.startsWith("/courses") ? "text-blue-700" : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              <BookOpen size={18} />
              Courses
            </button>

            <button
              type="button"
              onClick={() => router.push("/home")}
              className={[
                "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold",
                pathname === "/home" ? "text-blue-700" : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              <Home size={18} />
              Home
            </button>

            <button
              type="button"
              onClick={() => router.push("/practice/questions")}
              className={[
                "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold",
                pathname?.startsWith("/practice/questions")
                  ? "text-blue-700"
                  : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white shadow-md">
                <ClipboardList size={18} />
              </div>
              <span className="-mt-1">Q Bank</span>
            </button>

            <button
              type="button"
              onClick={() => router.push("/vocab")}
              className={[
                "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold",
                pathname?.startsWith("/vocab") ? "text-blue-700" : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              <SpellCheck size={18} />
              Vocab
            </button>
          </div>
        </div>
      </div>
      {requireOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Profile required</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Complete your profile</h2>
            <p className="mt-2 text-sm text-slate-600">
              Please add the required information before continuing.
            </p>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">First name *</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={form.first_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Last name *</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={form.last_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Nickname (optional)</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.nickname}
                  onChange={(e) => setForm((prev) => ({ ...prev, nickname: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Phone number *</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.phone_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone_number: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Parent name *</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.parent_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, parent_name: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Parent phone *</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.parent_phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, parent_phone: e.target.value }))}
                />
              </div>
            </div>

            {saveError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveError}
              </div>
            ) : null}

            <button
              onClick={saveRequiredProfile}
              disabled={saving}
              className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save and continue"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
