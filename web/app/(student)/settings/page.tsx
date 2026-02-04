"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);

  // cache buster for image refresh
  const [avatarVersion, setAvatarVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const access =
        typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!access) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${access}` },
      }).catch(() => null);

      if (cancelled) return;
      if (!res || !res.ok) return;

      const prof = await res.json().catch(() => null);
      if (!prof) return;

      const nick =
        prof.nickname ||
        prof.user?.username ||
        prof.user?.email?.split("@")[0] ||
        "Student";

      setNickname(nick);
      if (prof.avatar) setAvatarUrl(prof.avatar);
      setIsAdmin(Boolean(prof.is_admin) || (prof.role || "").toLowerCase() === "admin");
      setAvatarVersion((v) => v + 1);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveNickname() {
    setMessage(null);
    setLoading(true);

    const access =
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!access) {
      setLoading(false);
      setMessage("Not logged in.");
      return;
    }

    const clean = nickname.trim();

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/profile/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access}`,
      },
      body: JSON.stringify({ nickname: clean.length ? clean : null }),
    }).catch(() => null);

    setLoading(false);

    if (!res) {
      setMessage("Could not reach server.");
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setMessage(data?.detail || "Failed to save nickname (endpoint not ready yet).");
      return;
    }

    setMessage("Nickname saved ✅");
  }

  async function uploadAvatar(file: File) {
    setMessage(null);
    setLoading(true);

    const access =
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!access) {
      setLoading(false);
      setMessage("Not logged in.");
      return;
    }

    const fd = new FormData();
    fd.append("avatar", file);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/avatar/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}` },
      body: fd,
    }).catch(() => null);

    setLoading(false);

    if (!res) {
      setMessage("Could not reach server.");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setMessage(data?.error || "Failed to upload avatar.");
      return;
    }

    const data = await res.json().catch(() => null);
    if (data?.avatar) {
      setAvatarUrl(data.avatar);
      setAvatarVersion((v) => v + 1);
      setMessage("Profile photo updated ✔️");
    } else {
      setMessage("Uploaded, but no avatar URL returned.");
    }
  }

  return (
    <div className="max-w-5xl px-4 py-6 space-y-6">
      <div className="rounded-3xl border bg-white shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Account</div>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">Settings</h1>
            <p className="text-sm text-neutral-600">Update your profile and manage access.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Profile card */}
        <div className="lg:col-span-3 rounded-2xl border bg-white shadow-sm p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-sky-100 text-sky-700 grid place-items-center text-xl font-bold">
              {nickname?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <div className="text-sm uppercase tracking-[0.15em] text-slate-500">Profile</div>
              <div className="text-lg font-semibold text-slate-900">Your info</div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 md:items-start">
            <div className="shrink-0">
              <div className="h-24 w-24 rounded-full border border-slate-200 bg-slate-100 overflow-hidden grid place-items-center text-2xl">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${avatarUrl}?v=${avatarVersion}`}
                    alt="avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "🙂"
                )}
              </div>
            </div>
            <div className="flex-1 space-y-3">
              <div className="text-sm font-medium text-slate-800">Change profile photo</div>
              <input
                type="file"
                accept="image/*"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar(f);
                }}
                className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:bg-slate-900 file:text-white hover:file:bg-slate-800"
              />
              <p className="text-xs text-neutral-500">
                Uploads will work after we add the Django media endpoint.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Nickname</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g., Ayan"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
            />
            <button
              onClick={saveNickname}
              disabled={loading}
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save nickname"}
            </button>
            {message ? <div className="text-sm text-slate-600 mt-2">{message}</div> : null}
          </div>
        </div>

        {/* Admin tools */}
        {isAdmin ? (
          <div className="lg:col-span-2 rounded-2xl border bg-white shadow-sm p-5 space-y-4">
            <div>
              <div className="text-sm uppercase tracking-[0.15em] text-slate-500">Admin</div>
              <div className="text-lg font-semibold text-slate-900">Platform controls</div>
              <p className="text-xs text-neutral-500 mt-1">
                You are logged in as an admin. Use these tools to manage the platform.
              </p>
            </div>
            <div className="space-y-3">
              <AdminLink href="/settings/admin/courses" label="Manage courses" />
              <AdminLink href="/settings/admin/users" label="Manage users (students/teachers)" />
              <AdminLink href="/settings/admin/memberships" label="Assign users to courses" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AdminLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-[1px] hover:bg-white hover:shadow"
    >
      <span>{label}</span>
      <span className="text-slate-400">→</span>
    </Link>
  );
}
