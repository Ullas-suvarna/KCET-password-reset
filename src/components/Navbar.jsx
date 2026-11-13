import React from 'react';

export default function Navbar() {
  return (
    <header className="w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-md sm:max-w-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-2.5">
          <div className="relative shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-500 shadow-sm">
              <img 
                src="/app-logo.png" 
                alt="KCET App Logo" 
                className="w-full h-full object-cover rounded-[10px]"
              />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" title="Service Active" />
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5 leading-tight">
              <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900">
                KCET <span className="text-blue-600">App</span>
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 uppercase tracking-wider">
                Auth
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium hidden xs:block">
              Karnataka CET Portal
            </span>
          </div>
        </div>

        {/* Personal Branding - ULLAS U SUVARNA */}
        <div className="flex items-center">
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100/80 border border-slate-200/70 text-slate-500 shadow-2xs">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
            <span className="text-[10px] sm:text-[11px] font-mono tracking-wider font-semibold uppercase whitespace-nowrap text-slate-600">
              ULLAS U SUVARNA
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
