'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Wallet, CreditCard, Target, BarChart3, PieChart, Repeat, Tags, Settings, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import useLogout from '@/hooks/useLogout';

// Single source of truth for the navigation, shared by the desktop sidebar and the mobile drawer.
export const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Wallet, label: 'Accounts', href: '/dashboard/accounts' },
  { icon: CreditCard, label: 'Transactions', href: '/dashboard/transactions' },
  { icon: Target, label: 'Goals', href: '/dashboard/goals' },
  { icon: PieChart, label: 'Budgets', href: '/dashboard/budgets' },
  { icon: Repeat, label: 'Recurring', href: '/dashboard/recurring' },
  { icon: Tags, label: 'Categories', href: '/dashboard/categories' },
  { icon: BarChart3, label: 'Statistics', href: '/dashboard/stats' },
];

/** Active when on the item's page or any page below it; '/dashboard' only matches itself. */
export function isNavActive(pathname, href) {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Menu + footer links. `onNavigate` lets the mobile drawer close itself when something is chosen. */
export function SidebarContent({ onNavigate }) {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <>
      <div className="p-4"></div>

      <nav aria-label="Main" className="flex-1 px-4 space-y-2">
        {menuItems.map((item) => {
          const isActive = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon size={20} className={clsx(isActive ? "text-primary" : "text-gray-500 group-hover:text-white")} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5 space-y-2">
        <Link
          href="/dashboard/settings"
          onClick={onNavigate}
          className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          <Settings size={20} />
          <span>Settings</span>
        </Link>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors text-left"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-[20%] h-screen bg-secondary border-r border-white/5 fixed left-0 top-0 overflow-y-auto">
      <SidebarContent />
    </aside>
  );
}
