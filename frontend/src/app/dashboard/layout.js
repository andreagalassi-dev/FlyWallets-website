"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [navPathname, setNavPathname] = useState(pathname);
  const closeNav = useCallback(() => setNavOpen(false), []);

  // Close the mobile drawer on route change (state adjusted during render, no effect needed)
  if (pathname !== navPathname) {
    setNavPathname(pathname);
    setNavOpen(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MobileNav open={navOpen} onClose={closeNav} />

      <div className="md:ml-[20%] flex flex-col min-h-screen">
        <Header onMenuClick={() => setNavOpen((o) => !o)} navOpen={navOpen} />
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
