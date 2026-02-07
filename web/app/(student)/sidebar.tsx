"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  BookOpen,
  ClipboardList,
  Layers,
  SpellCheck,
  Calculator,
  Settings,
  LogOut,
} from "lucide-react";

type NavItem =
  | { section: string }
  | { label: string; href: string; icon: React.ComponentType<{ size?: number }> };

const items: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Courses", href: "/courses", icon: BookOpen },

  { section: "Practice" },
  { label: "Question Bank", href: "/practice/questions", icon: ClipboardList },
  { label: "Module Practice", href: "/practice/modules", icon: Layers },

  { label: "Vocab", href: "/vocab", icon: SpellCheck },
  { label: "Score Calculator", href: "/score-calculator", icon: Calculator },

  { label: "Settings", href: "/settings", icon: Settings },
];

function roleLabel(role: string | null | undefined) {
  const r = (role ?? "").toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "teacher") return "Teacher";
  return "Student";
}

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [nickname, setNickname] = useState("Student");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [roleText, setRoleText] = useState<string>("Student");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const access =
        typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!access) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${access}` },
      }).catch(() => null);

      if (cancelled) return;

      if (!res || !res.ok) return;

      const data = await res.json().catch(() => null);

      if (data?.user) {
        const profile = data;
        const nick = profile.nickname || profile.user?.email?.split("@")[0];
        if (nick) setNickname(nick);
        if (profile.avatar) setAvatarUrl(profile.avatar);

        // Prefer role column; fallback to is_admin if needed
        const label = profile.role
          ? roleLabel(profile.role)
          : profile.is_admin
            ? "Admin"
            : "Student";
        setRoleText(label);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.replace("/login");
  }

  return (
    <aside
      className={`z-50 w-[270px] shrink-0 border-r border-white/10 bg-gradient-to-b from-[#0b2f6b] via-[#0d47a1] to-[#2f78ff] text-[#eaf2ff] p-4 shadow-[2px_0_16px_rgba(0,0,0,0.18)] transition-transform duration-200
        fixed inset-y-0 left-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:sticky md:top-0 md:h-screen md:translate-x-0`}
    >
      <div className="mb-3 flex items-center justify-between md:hidden">
        <div className="text-sm font-semibold">Menu</div>
        <button
          className="h-8 w-8 rounded-full border border-white/20 text-white"
          onClick={onClose}
          aria-label="Close menu"
        >
          ×
        </button>
      </div>
{/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Image
          src="/Victory1.PNG"
          alt="Victory College logo"
          width={48}
          height={48}
          style={{ objectFit: "contain" }}
          priority
        />
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#eaf2ff" }}>Victory College</div>
          <div style={{ color: "#c8ddff", fontSize: 12 }}>Prep Platform</div>
        </div>
      </div>

      {/* Profile */}
      <div
        style={{
          marginTop: 16,
          padding: 12,
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 12,
          background: "rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.25)",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "🙂"
            )}
          </div>

          <div>
            <div style={{ fontWeight: 800, color: "#fff" }}>{nickname}</div>
            <div style={{ color: "#d8e5ff", fontSize: 12 }}>{roleText}</div>
          </div>
        </div>

        <a
          href="https://www.victorygroup.az/"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            marginTop: 10,
            color: "#dbeafe",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          ↗ Visit main website
        </a>
      </div>

      {/* Nav */}
      <nav style={{ marginTop: 14, display: "grid", gap: 6 }}>
        {items.map((item, i) => {
          if ("section" in item) {
            return (
              <div
                key={`section-${i}`}
                style={{
                  marginTop: 10,
                  marginBottom: 4,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.7)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                {item.section}
              </div>
            );
          }

          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 10px",
                borderRadius: 10,
                textDecoration: "none",
                color: active ? "#0d47a1" : "#e8f0ff",
                background: active ? "#e0f2fe" : "rgba(255,255,255,0.06)",
                border: active ? "1px solid #b6e0ff" : "1px solid transparent",
                boxShadow: active ? "0 6px 14px rgba(0,0,0,0.2)" : "none",
              }}
            >
              <Icon size={18} />
              <span style={{ fontWeight: active ? 700 : 500 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          right: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 10,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.12)",
          color: "#eaf2ff",
          cursor: "pointer",
          fontWeight: 700,
          boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
        }}
      >
        <LogOut size={18} />
        Log out
      </button>
    </aside>
  );
}
