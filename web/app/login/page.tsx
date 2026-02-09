"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import bg from "./background.jpg";
import logo from "./VICTORY COLLEGE.png";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanUsername = username.trim().toLowerCase();

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/auth/token/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: cleanUsername, password }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || "Login failed");
      }

      const data: { access: string; refresh: string } = await res.json();

      // Store tokens temporarily; replace with httpOnly cookie flow later
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);

      router.push("/home");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to sign in.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        position: "relative",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
      }}
    >
      {/* Background image */}
      <Image
        src={bg}
        alt="Campus"
        fill
        priority
        style={{ objectFit: "cover", zIndex: 0, filter: "grayscale(12%)" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(13, 71, 161, 0.35)",
          zIndex: 1,
        }}
      />

      {/* Glass card */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "min(440px, 90vw)",
          padding: "32px 32px 28px",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.5)",
          background: "rgba(255,255,255,0.12)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "grid", placeItems: "center", marginBottom: 24 }}>
          <Image
            src={logo}
            alt="Victory College"
            style={{ objectFit: "contain" }}
            width={160}
            height={60}
            priority
          />
        </div>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 14 }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.9)",
              color: "#0f172a",
              fontSize: 15,
              outline: "none",
            }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.9)",
              color: "#0f172a",
              fontSize: 15,
              outline: "none",
            }}
          />

          {error && (
            <div style={{ color: "#f43f5e", fontSize: 13, textAlign: "center" }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.6)",
              background: "rgba(255,255,255,0.22)",
              color: "#ffffff",
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: loading ? "wait" : "pointer",
              textTransform: "uppercase",
              boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <a
            href="#"
            style={{
              color: "#e2e8f0",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Forgot your password?
          </a>
        </div>
      </div>
    </div>
  );
}
