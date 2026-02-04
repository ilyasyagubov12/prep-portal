"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");
    }

    load();
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
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
