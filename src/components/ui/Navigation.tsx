"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Globe, Menu, X } from "lucide-react";

type NavLink = { href: string; label: string };

const NAV_LINKS: Record<"en" | "zh", NavLink[]> = {
  en: [
    { href: "/find-creators", label: "Find Creators" },
    { href: "/campaigns", label: "Campaigns" },
    { href: "/entertainment-live", label: "Live Streaming" },
    { href: "/private-community", label: "Private Community" },
    { href: "/membership", label: "Membership" },
    { href: "/how-it-works", label: "How it Works" },
  ],
  zh: [
    { href: "/zh/find-creators", label: "寻找创作者" },
    { href: "/zh/campaigns", label: "广告活动" },
    { href: "/zh/entertainment-live", label: "娱乐直播" },
    { href: "/zh/private-community", label: "私域社区" },
    { href: "/zh/membership", label: "会员方案" },
    { href: "/zh/about", label: "关于我们" },
  ],
};

function initialsFromName(name?: string | null) {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "C";
}

function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span
      className={`relative inline-grid place-items-center rounded-[9px] ${className}`}
      style={{
        background:
          "radial-gradient(120% 120% at 0% 0%, oklch(0.7 0.2 305) 0%, transparent 55%), radial-gradient(140% 120% at 100% 100%, oklch(0.55 0.22 270) 0%, transparent 60%), linear-gradient(135deg, oklch(0.42 0.2 290), oklch(0.32 0.18 285))",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.08), 0 6px 14px -8px oklch(0.42 0.2 290 / 0.55)",
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        className="h-[14px] w-[14px] text-white"
      >
        <path d="M5 5l14 14M19 5L5 19" />
      </svg>
      <span
        className="pointer-events-none absolute inset-px rounded-[8px]"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.12), transparent 40%)" }}
      />
    </span>
  );
}

export default function Navigation() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDesktopView, setIsDesktopView] = useState(true);

  const isChinesePath = pathname.startsWith("/zh");
  const currentNavLinks = isChinesePath ? NAV_LINKS.zh : NAV_LINKS.en;

  const switchLanguage = () => {
    if (isChinesePath) {
      const englishPath = pathname.replace(/^\/zh/, "") || "/";
      router.push(englishPath);
    } else {
      router.push(`/zh${pathname}`);
    }
  };

  useEffect(() => {
    const calculateView = () => {
      if (typeof window === "undefined") return;
      setIsDesktopView(window.innerWidth >= 1100);
    };
    calculateView();
    window.addEventListener("resize", calculateView);
    return () => window.removeEventListener("resize", calculateView);
  }, []);

  useEffect(() => {
    if (isDesktopView) setIsMenuOpen(false);
  }, [isDesktopView]);

  const userInitials = useMemo(() => initialsFromName(session?.user?.name), [session?.user?.name]);

  if (status === "loading") {
    return (
      <nav className="bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-3">
            <div className="h-7 w-7 animate-pulse rounded-[9px] bg-slate-200" />
            <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      </nav>
    );
  }

  if (pathname.startsWith("/brandportal") || pathname.startsWith("/creatorportal")) {
    return null;
  }

  const isActive = (path: string) => pathname === path;
  const homeHref = isChinesePath ? "/zh" : "/";
  const role = (session?.user as { role?: string } | undefined)?.role;
  const dashboardHref = role === "BRAND" ? "/brandportal/dashboard" : "/creatorportal/dashboard";

  return (
    <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-6">
          <Link href={homeHref} className="flex shrink-0 items-center gap-2.5">
            <LogoMark />
            <span className="text-[17px] font-semibold tracking-tight text-slate-900 whitespace-nowrap">
              Cricher<span className="font-medium text-slate-400">.ai</span>
            </span>
          </Link>

          {isDesktopView && (
            <div className="flex flex-1 items-center justify-center gap-7">
              {currentNavLinks.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative whitespace-nowrap py-[22px] text-sm font-medium transition-colors ${
                      active ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {link.label}
                    {active && (
                      <span
                        className="pointer-events-none absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-purple-600"
                        aria-hidden
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {isDesktopView && (
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={switchLanguage}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Switch language"
              >
                <Globe className="h-4 w-4" />
              </button>
              {!session ? (
                <>
                  <Link
                    href={isChinesePath ? "/zh/login" : "/login"}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                  >
                    {isChinesePath ? "登录" : "Log in"}
                  </Link>
                  <Link
                    href={isChinesePath ? "/zh/join-creator" : "/join-creator"}
                    className="inline-flex items-center justify-center rounded-lg border border-purple-200 bg-purple-50 px-3.5 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100 whitespace-nowrap"
                  >
                    {isChinesePath ? "成为创作者" : "Join as Creator"}
                  </Link>
                  <Link
                    href={isChinesePath ? "/zh/join-brand" : "/join-brand"}
                    className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 whitespace-nowrap"
                  >
                    {isChinesePath ? "成为品牌" : "Join as Brand"}
                  </Link>
                </>
              ) : (
                <>
                  <div
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3"
                    title={session.user?.name ?? undefined}
                  >
                    <span
                      className="grid h-6 w-6 place-items-center rounded-full text-[10.5px] font-semibold text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.65 0.18 250), oklch(0.55 0.2 285))",
                      }}
                      aria-hidden
                    >
                      {userInitials}
                    </span>
                    <span className="max-w-[140px] truncate text-sm font-medium text-slate-800">
                      {session.user?.name || (isChinesePath ? "用户" : "User")}
                    </span>
                  </div>

                  <Link
                    href={dashboardHref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3.5 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
                  >
                    {isChinesePath ? "仪表板" : "Dashboard"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              )}
            </div>
          )}

          {!isDesktopView && (
            <div className="flex items-center gap-1">
              <button
                onClick={switchLanguage}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Switch language"
              >
                <Globe className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              >
                {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {!isDesktopView && isMenuOpen && (
        <div className="border-t border-slate-200 bg-white px-3 pb-4 pt-2">
          <div className="space-y-1">
            {currentNavLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                    active ? "bg-purple-50 text-purple-700" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-3 border-t border-slate-200 pt-3">
            {!session ? (
              <div className="space-y-1">
                <Link
                  href={isChinesePath ? "/zh/login" : "/login"}
                  onClick={() => setIsMenuOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {isChinesePath ? "登录" : "Log in"}
                </Link>
                <Link
                  href={isChinesePath ? "/zh/join-creator" : "/join-creator"}
                  onClick={() => setIsMenuOpen(false)}
                  className="block rounded-lg bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
                >
                  {isChinesePath ? "成为创作者" : "Join as Creator"}
                </Link>
                <Link
                  href={isChinesePath ? "/zh/join-brand" : "/join-brand"}
                  onClick={() => setIsMenuOpen(false)}
                  className="block rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700"
                >
                  {isChinesePath ? "成为品牌" : "Join as Brand"}
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span
                    className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold text-white"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.65 0.18 250), oklch(0.55 0.2 285))",
                    }}
                    aria-hidden
                  >
                    {userInitials}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-800">
                    {session.user?.name || (isChinesePath ? "用户" : "User")}
                  </span>
                </div>
                <Link
                  href={dashboardHref}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
                >
                  {isChinesePath ? "仪表板" : "Dashboard"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
