'use client';

import { useState } from 'react';
import { Search, Menu } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import useAuthStore from '@/store/authStore';
import { MOBILE_NAV_ID } from '@/components/layout/MobileNav';
import { BudgetBell } from '@/components/layout/BudgetBell';

export function Header({ onMenuClick, navOpen = false }) {
  const { user } = useAuthStore();
  const router = useRouter();
  const [term, setTerm] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    const q = term.trim();
    router.push(q ? `/dashboard/transactions?search=${encodeURIComponent(q)}` : '/dashboard/transactions');
  };

  return (
    <header className="h-16 border-b border-white/5 bg-secondary/50 backdrop-blur-md sticky top-0 z-20 flex items-center px-4 sm:px-6 justify-between gap-3 sm:gap-4">

      {/* Left: Mobile Menu & Branding */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="md:hidden text-gray-400 hover:text-white"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          aria-expanded={navOpen}
          aria-controls={MOBILE_NAV_ID}
        >
          <Menu size={24} />
        </button>
        <h2 className="text-xl font-bold text-primary tracking-tight hidden md:block">FlyWallets</h2>
      </div>

      {/* Global Search (searches transactions) */}
      <form onSubmit={handleSearch} role="search" className="flex items-center max-w-md w-full min-w-0 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search transactions..."
            aria-label="Search transactions"
            className="w-full bg-black/20 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </form>

      {/* Actions & User */}
      <div className="flex items-center gap-3 sm:gap-4">
        <BudgetBell />

        {user && (

           <Link href="/dashboard/profile" className="flex items-center gap-3 sm:pl-4 sm:border-l border-white/10 group" aria-label="Profile">
               <div className="text-right hidden sm:block">
                   <p className="text-sm font-medium text-white group-hover:underline decoration-primary underline-offset-4 transition-all">
                       {user.user_type?.toLowerCase() === 'individual'
                         ? ((user.first_name || user.last_name) ? `${user.first_name || ''} ${user.last_name || ''}` : 'User')
                         : (user.company_name || 'Business')}
                   </p>
               </div>
               <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/20 group-hover:bg-primary/30 transition-colors uppercase">
                   {user.user_type?.toLowerCase() === 'individual'
                     ? (user.first_name?.[0] || 'U')
                     : (user.company_name?.[0] || 'B')}
               </div>
           </Link>
        )}
      </div>
    </header>
  );
}
