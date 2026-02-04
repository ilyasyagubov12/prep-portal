"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    async function load() {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`${API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (!res || !res.ok) {
        router.replace("/login");
        return;
      }

      const me = await res.json().catch(() => null);
      setEmail(me?.user?.email ?? "");
    }

    load();
  }, [router]);

  async function logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
    router.replace("/login");
  }

  return (
    <div style={{ maxWidth: 700, margin: "80px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Dashboard</h1>
      <p style={{ marginTop: 10 }}>Logged in as: {email}</p>

      <button
        onClick={logout}
        style={{
          marginTop: 18,
          padding: 10,
          borderRadius: 10,
          border: "1px solid #333",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Log out
      </button>
    </div>
  );
}
