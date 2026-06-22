"use client";

import React from 'react';
import { useRouter } from 'next/navigation';

interface MatrixLayoutProps {
  topDrum: React.ReactNode;
  leftDrum: React.ReactNode;
  children: React.ReactNode;
  headerTitle: React.ReactNode;
  progress: number;
  progressColor?: string;
}

export const MatrixLayout: React.FC<MatrixLayoutProps> = ({
  topDrum,
  leftDrum,
  children,
  headerTitle,
  progress,
  progressColor = "text-blue-600"
}) => {
  const router = useRouter();

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans text-slate-600">
      
      {/* 1. TOP AREA */}
      <nav className="h-20 bg-slate-900 border-b border-slate-700 relative flex-shrink-0 z-30 shadow-xl">
        {/* Center Indicator */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[200px] h-full bg-white/5 border-x border-white/10 pointer-events-none z-0"></div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px] border-t-blue-500 z-40"></div>
        
        {/* Gradient Masks */}
        <div className="absolute left-0 top-0 h-full w-32 bg-gradient-to-r from-slate-900 to-transparent pointer-events-none z-20"></div>
        <div className="absolute right-0 top-0 h-full w-32 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none z-20"></div>

        {/* Logo */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 text-white font-black italic text-xl tracking-tighter select-none">
          <span className="text-blue-500">Docu</span>Grid
        </div>

        {/* DRUM SLOT */}
        <div className="w-full h-full relative z-10">
          {topDrum}
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        
        {/* 2. LEFT AREA (Modified: Absolute positioning for button) */}
        <aside className="w-24 bg-slate-900 h-full relative flex-shrink-0 z-20 shadow-2xl border-r border-slate-700">
          {/* Center Indicator (背景の装飾) */}
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-20 bg-white/5 border-y border-white/10 pointer-events-none z-0"></div>
          
          {/* Gradient Masks */}
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-slate-900 to-transparent pointer-events-none z-20"></div>
          <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none z-20"></div>

          {/* DRUM (Full height) */}
          <div className="h-full w-full relative z-10">
            {leftDrum}
          </div>

          {/* SETTINGS BUTTON (Absolute Overlay at Bottom) */}
          <div className="absolute bottom-0 left-0 w-full h-20 flex items-center justify-center border-t border-slate-800 z-30 bg-slate-900/95 backdrop-blur-sm">
            <button 
              onClick={() => router.push('/settings')}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg border border-slate-700 hover:border-slate-500"
              title="設定"
            >
              <span className="text-xl">⚙</span>
            </button>
          </div>
        </aside>

        {/* 3. MAIN CONTENT AREA */}
        <main className="flex-1 flex flex-col bg-slate-100 relative min-w-0">
          <header className="bg-white/80 backdrop-blur px-8 py-3 border-b border-slate-200 flex justify-between items-center z-10 shadow-sm">
            <div>
              {headerTitle}
            </div>
            
            {/* Progress Circle */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className={`text-2xl font-black transition-colors duration-500 ${progress === 100 ? 'text-green-500' : progressColor}`}>
                  {progress}%
                </span>
              </div>
              <div className="w-12 h-12 relative flex items-center justify-center">
                <svg className="transform -rotate-90 w-12 h-12">
                  <circle cx="24" cy="24" r={radius} stroke="#e2e8f0" strokeWidth="4" fill="transparent" />
                  <circle 
                    cx="24" cy="24" r={radius} 
                    stroke="currentColor" strokeWidth="4" fill="transparent" 
                    strokeDasharray={circumference} 
                    strokeDashoffset={strokeDashoffset} 
                    className={`transition-all duration-700 ${progress === 100 ? 'text-green-500' : 'text-blue-500'}`} 
                  />
                </svg>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 relative">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};