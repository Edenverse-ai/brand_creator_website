"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  DollarSign,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  Users,
  CheckCircle,
  PlayCircle,
} from "lucide-react";
import Loading from "@/components/ui/Loading";
import "@/styles/portals.css";

// All navigation items
const navigationItems = [
  { name: "Dashboard", href: "/creatorportal/dashboard", icon: LayoutDashboard },
  { name: "Income", href: "/creatorportal/income", icon: DollarSign },
  { name: "Campaign Applications", href: "/creatorportal/applications", icon: CheckCircle },
  //{ name: 'Posts', href: '/creatorportal/posts', icon: Image },
  { name: "TikTok Verify", href: "/creatorportal/tiktok-verify", icon: CheckCircle },
  { name: "AI Video", href: "/creatorportal/ai-video", icon: PlayCircle },
  { name: "Join Us", href: "/career", icon: Users },
  //{ name: 'Social Media', href: '/creatorportal/social', icon: Share2 },
  //{ name: 'Earnings', href: '/creatorportal/earnings', icon: DollarSign },
];

// System items that are always in the dropdown
const systemItems = [
  { name: "Profile", href: "/creatorportal/profile", icon: Users },
  { name: "Message Us", href: "/contact", icon: MessageSquare },
  { name: "Settings", href: "/creatorportal/settings", icon: Settings },
  { name: "Sign out", icon: LogOut, onClick: () => signOut({ callbackUrl: "/" }) },
];

export default function CreatorPortalLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showDesktopDropdown, setShowDesktopDropdown] = useState(false);
  const [showMobileDropdown, setShowMobileDropdown] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && session?.user?.role !== "CREATOR") {
      router.push("/login");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return <Loading />;
  }

  const renderNavLinks = ({
    onNavigate,
    variant = "default",
  }: {
    onNavigate?: () => void;
    variant?: "sidebar" | "default";
  } = {}) =>
    navigationItems.map((item) => {
      const isActive = pathname === item.href;
      const variantClasses =
        variant === "sidebar"
          ? isActive
            ? "bg-white/15 text-white"
            : "text-indigo-100 hover:bg-white/10 hover:text-white"
          : isActive
            ? "bg-indigo-50 text-indigo-700"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
      const iconColor =
        variant === "sidebar"
          ? isActive
            ? "text-white"
            : "text-indigo-200"
          : isActive
            ? "text-indigo-600"
            : "text-slate-400";
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${variantClasses}`}
        >
          <item.icon className={`h-4 w-4 ${iconColor}`} />
          {item.name}
        </Link>
      );
    });

  const renderSystemLinks = ({
    onNavigate,
    variant = "default",
  }: {
    onNavigate?: () => void;
    variant?: "sidebar" | "default";
  } = {}) =>
    systemItems.map((item) =>
      item.onClick ? (
        <button
          key={item.name}
          onClick={item.onClick}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
            variant === "sidebar"
              ? "text-indigo-100 hover:bg-white/10 hover:text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <item.icon
            className={`h-4 w-4 ${variant === "sidebar" ? "text-indigo-200" : "text-slate-400"}`}
          />
          {item.name}
        </button>
      ) : (
        <Link
          key={item.href}
          href={item.href!}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
            variant === "sidebar"
              ? "text-indigo-100 hover:bg-white/10 hover:text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <item.icon
            className={`h-4 w-4 ${variant === "sidebar" ? "text-indigo-200" : "text-slate-400"}`}
          />
          {item.name}
        </Link>
      )
    );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-900 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3 px-6 py-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="Cricher AI Logo"
            className="h-10 w-10 rounded-2xl border border-white/20"
          />
          <div>
            <p className="text-lg font-semibold">Cricher AI</p>
            <p className="text-xs uppercase tracking-[0.4em] text-white/60">CreatorHub</p>
          </div>
        </Link>
        <div className="flex-1 space-y-6 px-4 py-4">
          <div>
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.4em] text-white/40">
              Workspace
            </p>
            <div className="mt-4 space-y-1">{renderNavLinks({ variant: "sidebar" })}</div>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Desktop header */}
        <header className="hidden items-center justify-between border-b border-slate-200 bg-white px-10 py-2 lg:flex">
          <div>
            <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.3em] text-slate-400">
              Creator workspace
            </p>
            <h1 className="text-base font-semibold leading-6 text-slate-900">
              Cricher AI CreatorHub
            </h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowDesktopDropdown((prev) => !prev)}
              className="flex items-center gap-2.5 rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700"
            >
              {session?.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || ""}
                  className="h-7 w-7 rounded-full"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  {session?.user?.name?.[0] ?? "C"}
                </div>
              )}
              <div className="text-left">
                <p className="text-sm font-semibold leading-5 text-slate-900">
                  {session?.user?.name ?? "Creator"}
                </p>
                <p className="text-xs leading-4 text-slate-500">{session?.user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>
            {showDesktopDropdown && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                {renderSystemLinks({ onNavigate: () => setShowDesktopDropdown(false) })}
              </div>
            )}
          </div>
        </header>

        {/* Mobile header */}
        <header className="relative flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="Cricher AI Logo" className="h-8 w-8 rounded-lg" />
            <span className="text-base font-semibold text-slate-900">CreatorHub</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowMobileDropdown((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
              >
                {session?.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt={session.user.name || ""}
                    className="h-7 w-7 rounded-full"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                    {session?.user?.name?.[0] ?? "C"}
                  </div>
                )}
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>
              {showMobileDropdown && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                  {renderSystemLinks({ onNavigate: () => setShowMobileDropdown(false) })}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowMobileMenu(true)}
              className="rounded-full border border-slate-200 p-2 text-slate-600"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Mobile slide-out navigation */}
        {showMobileMenu && (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-900/40"
              onClick={() => setShowMobileMenu(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-slate-900">Menu</p>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className="rounded-full border border-slate-200 p-1 text-slate-500"
                >
                  ✕
                </button>
              </div>
              <div className="mt-6 space-y-1">
                {renderNavLinks({ onNavigate: () => setShowMobileMenu(false) })}
              </div>
              <div className="mt-6 border-t border-slate-200 pt-6">
                <p className="px-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Account
                </p>
                <div className="mt-3 space-y-1">
                  {renderSystemLinks({ onNavigate: () => setShowMobileMenu(false) })}
                </div>
              </div>
            </div>
          </>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
