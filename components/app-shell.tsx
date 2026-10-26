"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Bell,
  Briefcase,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  ScrollText,
  Users,
  X,
} from "lucide-react";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { BrandMark } from "@/components/brand-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(auth)/actions";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  adminOnly?: boolean;
  badge?: number;
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/cases", label: "Cases", icon: Briefcase },
      { href: "/transfers", label: "Transfers", icon: ArrowLeftRight },
      { href: "/search", label: "Search", icon: Search },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/members", label: "Members", icon: Users, adminOnly: true },
      { href: "/audit", label: "Audit log", icon: ScrollText, adminOnly: true },
      { href: "/settings", label: "Firm settings", icon: Settings, adminOnly: true },
    ],
  },
];

const levelNames = { 1: "Standard", 2: "High", 3: "Maximum" } as const;
const levelStyles = {
  1: "border-slate-400/30 bg-slate-400/15 text-slate-200",
  2: "border-amber-400/30 bg-amber-400/15 text-amber-200",
  3: "border-rose-400/30 bg-rose-400/15 text-rose-200",
} as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavContent({
  user,
  firmName,
  incomingCount,
  onNavigate,
}: {
  user: Profile;
  firmName: string;
  incomingCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <BrandMark inverse href="/cases" />
      </div>

      <div className="px-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
          <p className="truncate text-[11px] font-medium text-slate-300">
            {firmName}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
            <ShieldCheck className="h-3 w-3 text-emerald-400/80" aria-hidden />
            Firm workspace · audited
          </p>
        </div>
      </div>

      <nav className="scrollbar-thin mt-6 flex-1 overflow-y-auto px-3 pb-4">
        {navSections.map((section) => {
          const items = section.items.filter(
            (item) => !item.adminOnly || user.role === "firm_admin",
          );
          if (items.length === 0) return null;
          return (
            <div key={section.label} className="mb-6">
              <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                          active
                            ? "bg-white/[0.09] text-white"
                            : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
                        )}
                      >
                        {active && (
                          <span className="absolute -left-3 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-indigo-400" />
                        )}
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            active
                              ? "text-indigo-300"
                              : "text-slate-500 group-hover:text-slate-300",
                          )}
                          aria-hidden
                        />
                        <span className="flex-1">{item.label}</span>
                        {item.href === "/transfers" && incomingCount > 0 && (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-semibold text-white">
                            {incomingCount}
                          </span>
                        )}
                        {active && (
                          <ChevronRight
                            className="h-3 w-3 text-slate-500"
                            aria-hidden
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/8 p-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Your clearance
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                levelStyles[user.clearance_level],
              )}
            >
              L{user.clearance_level}
            </span>
          </div>
          <p className="mt-2 text-[12px] font-medium text-slate-200">
            {levelNames[user.clearance_level]}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Exact-match access. Only L{user.clearance_level} documents open for
            you — never a level above or below.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  user,
  firmName,
  incomingCount,
  children,
}: {
  user: Profile;
  firmName: string;
  incomingCount: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-ink-900 lg:block">
        <NavContent
          user={user}
          firmName={firmName}
          incomingCount={incomingCount}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <NavContent
              user={user}
              firmName={firmName}
              incomingCount={incomingCount}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <form
            onSubmit={submitSearch}
            className="relative hidden max-w-md flex-1 sm:block"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cases and documents…"
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-9 pr-12 text-[13px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
              aria-label="Search cases and documents"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              /
            </kbd>
          </form>

          <div className="flex flex-1 items-center justify-end gap-1.5 sm:flex-none">
            <span className="mr-2 hidden items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 xl:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Audit chain live
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Notifications"
                >
                  <Bell className="h-4.5 w-4.5" />
                  {incomingCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 ring-2 ring-white" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                {incomingCount > 0 ? (
                  <DropdownMenuItem asChild>
                    <Link href="/transfers" className="cursor-pointer">
                      <ArrowLeftRight className="h-4 w-4" />
                      <span>
                        {incomingCount} incoming transfer
                        {incomingCount === 1 ? "" : "s"} awaiting your response
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <div className="px-2 py-3 text-[12px] text-slate-500">
                    No new notifications.
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/audit" className="cursor-pointer">
                    <ScrollText className="h-4 w-4" />
                    Review the audit log
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-slate-100"
                  aria-label="Account menu"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-[11px] font-semibold text-white">
                    {initials(user.full_name)}
                  </span>
                  <span className="hidden text-left md:block">
                    <span className="block text-[12px] font-semibold leading-4 text-slate-800">
                      {user.full_name}
                    </span>
                    <span className="block text-[10px] leading-3 text-slate-400">
                      {user.role === "firm_admin"
                        ? "Firm administrator"
                        : user.role}
                    </span>
                  </span>
                  <ChevronDown
                    className="hidden h-3.5 w-3.5 text-slate-400 md:block"
                    aria-hidden
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 py-2">
                  <p className="text-[13px] font-medium text-slate-800">
                    {user.full_name}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {user.email}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500">
                    <ShieldCheck className="h-3 w-3 text-indigo-500" aria-hidden />
                    Clearance L{user.clearance_level} ·{" "}
                    {levelNames[user.clearance_level]}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/members" className="cursor-pointer">
                    <Users className="h-4 w-4" />
                    Firm members
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer">
                    <Settings className="h-4 w-4" />
                    Firm settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void signOutAction();
                  }}
                  className="text-rose-600 focus:bg-rose-50 focus:text-rose-700 [&_svg]:text-rose-500"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
