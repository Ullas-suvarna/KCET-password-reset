import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import PasswordResetCard from './components/PasswordResetCard';
import Footer from './components/Footer';

export default function App() {
  // Track active flow state to conditionally display watermark ONLY on the form page
  const [currentFlowState, setCurrentFlowState] = useState('READY');
  const isFormPage = currentFlowState === 'READY' || currentFlowState === 'SUBMITTING';

  // The full page layout — shared between / and /reset-password routes.
  // All existing JSX is preserved exactly as-is.
  const pageLayout = (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-[#F8FAFC] text-slate-800 relative selection:bg-blue-600 selection:text-white overflow-x-hidden">
      
      {/* 1. Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Soft top sky blue gradient */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[550px] sm:w-[750px] h-[400px] bg-gradient-to-b from-blue-100/70 via-sky-50/40 to-transparent rounded-full blur-3xl" />
        
        {/* Soft corner accents */}
        <div className="absolute -bottom-20 -right-20 w-[350px] h-[350px] bg-blue-50/70 rounded-full blur-[100px]" />
        <div className="absolute top-1/4 -left-20 w-[300px] h-[300px] bg-indigo-50/60 rounded-full blur-[90px]" />

        {/* Minimal dot grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.035]" 
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #1e40af 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }}
        />
      </div>

      {/* 
        2. CLEAN EXTRACTED KG EMBLEM WATERMARK:
        - Only the Graduation Cap and "KG" neon emblem (zero background box/tile)
        - Seamlessly merged across the entire page
        - Displayed strictly on the Form page (READY / SUBMITTING)
        - Completely hidden on Success, Error, and Portal pages
      */}
      {isFormPage && (
        <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none select-none overflow-hidden transition-all duration-300">
          <img 
            src="/kg-watermark.png" 
            alt="KCET App KG Watermark" 
            className="w-[88vw] max-w-[480px] sm:max-w-[620px] aspect-auto object-contain opacity-20 sm:opacity-25 pointer-events-none select-none filter contrast-125"
          />
        </div>
      )}

      {/* Navigation Header */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-3.5 py-4 sm:py-6 w-full relative z-10">
        <PasswordResetCard onStateChange={(state) => setCurrentFlowState(state)} />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );

  return (
    <Routes>
      {/* Root route: shows NO_PARAMS landing when visited without query params */}
      <Route path="/" element={pageLayout} />
      {/* Reset-password route: handles ?mode=resetPassword&oobCode=... links */}
      <Route path="/reset-password" element={pageLayout} />
    </Routes>
  );
}

