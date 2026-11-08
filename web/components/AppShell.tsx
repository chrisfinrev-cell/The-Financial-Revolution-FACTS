'use client';

import type { ReactNode } from 'react';
import Navbar from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#07090f] text-slate-100">
      <Navbar />
      <div className="flex flex-col md:flex-row">
        <Sidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export default AppShell;
