"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./sidebar";

export default function StudentLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

      if (!access) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${access}` },
      }).catch(() => null);

      if (cancelled) return;

      if (!res || !res.ok) {
        router.replace("/login");
        return;
      }

      setChecking(false);
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

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
      <main className="flex-1 p-4 sm:p-6">
        <div className="md:hidden mb-4">
          <button
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
            onClick={() => setSidebarOpen(true)}
          >
            ☰ Menu
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
