import React from 'react';
import { Shield, Smartphone } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full py-3 sm:py-4 border-t border-slate-200/80 bg-white/60 backdrop-blur-xs mt-auto">
      <div className="max-w-md sm:max-w-xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[11px] text-slate-500 text-center sm:text-left">
        <div className="flex items-center justify-center space-x-1.5">
          <Shield className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>Secured with Firebase Authentication</span>
        </div>

        <div className="flex items-center justify-center space-x-2 text-slate-500">
          <Smartphone className="w-3 h-3 text-slate-400 shrink-0" />
          <span>KCET App</span>
          <span>•</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
