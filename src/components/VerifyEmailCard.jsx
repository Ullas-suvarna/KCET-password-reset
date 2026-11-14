import React, { useState, useEffect } from 'react';
import { applyActionCode } from 'firebase/auth';
import { auth } from '../firebase';
import { 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Mail, 
  Smartphone, 
  ShieldCheck, 
  ExternalLink,
  ArrowRight,
  HelpCircle
} from 'lucide-react';

export default function VerifyEmailCard({ onStateChange }) {
  // Query parameters state
  const [mode, setMode] = useState('');
  const [oobCode, setOobCode] = useState('');
  const [continueUrl, setContinueUrl] = useState('');

  // Flow states: 'CHECKING' | 'SUCCESS' | 'ERROR' | 'INVALID_PARAMS'
  const [flowState, setFlowState] = useState('CHECKING');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');

  const updateFlowState = (newState) => {
    setFlowState(newState);
    if (onStateChange) {
      onStateChange(newState);
    }
  };

  // Run verification on mount
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlMode = searchParams.get('mode') || '';
      const urlOobCode = searchParams.get('oobCode') || '';
      const urlContinueUrl = searchParams.get('continueUrl') || '';

      setMode(urlMode);
      setOobCode(urlOobCode);
      setContinueUrl(urlContinueUrl);

      // Scenario 1: No query parameters provided
      if (!urlMode && !urlOobCode) {
        updateFlowState('INVALID_PARAMS');
        setErrorMessage('No verification code was found. Please open the link sent to your email.');
        return;
      }

      // Scenario 2: Wrong mode
      if (urlMode && urlMode !== 'verifyEmail') {
        updateFlowState('ERROR');
        setErrorCode('auth/invalid-mode');
        setErrorMessage(`Invalid link mode "${urlMode}". This page is strictly for email verification.`);
        return;
      }

      // Scenario 3: Missing action code
      if (!urlOobCode) {
        updateFlowState('ERROR');
        setErrorCode('auth/missing-action-code');
        setErrorMessage('The verification link is missing a security action code.');
        return;
      }

      // Scenario 4: Apply action code via Firebase Web SDK
      applyVerificationCode(urlOobCode);
    } catch (err) {
      updateFlowState('ERROR');
      setErrorCode('client/url-parse-error');
      setErrorMessage('Unable to process the verification link. Please check your browser address bar.');
    }
  }, []);

  // Apply the Firebase action code to verify the account email
  const applyVerificationCode = async (code) => {
    updateFlowState('CHECKING');
    setErrorMessage('');
    setErrorCode('');

    try {
      // Firebase Web SDK applies the oobCode to confirm email verification
      await applyActionCode(auth, code);
      updateFlowState('SUCCESS');
    } catch (err) {
      updateFlowState('ERROR');
      setErrorCode(err.code || '');

      switch (err.code) {
        case 'auth/expired-action-code':
          setErrorMessage('This verification link has expired. Verification links are time-limited for security. Please request a new verification email from the KCET GenZ app.');
          break;
        case 'auth/invalid-action-code':
          setErrorMessage('This verification link is invalid or has already been used. If you have already verified your account, you can sign in to the KCET GenZ app directly.');
          break;
        case 'auth/user-disabled':
          setErrorMessage('This KCET GenZ student account has been disabled. Please contact support.');
          break;
        case 'auth/user-not-found':
          setErrorMessage('The user account corresponding to this link could not be found. It may have been deleted.');
          break;
        case 'auth/network-request-failed':
          setErrorMessage('Network connection timeout. Please check your internet connection and try again.');
          break;
        default:
          setErrorMessage(err.message || 'Unable to verify email address. Please request a new link.');
          break;
      }
    }
  };

  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto">
      <div className="bg-white/92 backdrop-blur-md rounded-2xl p-5 sm:p-7 border border-slate-200/80 shadow-xl shadow-slate-200/40 relative overflow-hidden transition-all duration-300">
        
        {/* Subtle decorative top accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-sky-400 to-indigo-500 z-20" />

        {/* ---------------- STATE: CHECKING / VERIFYING ---------------- */}
        {flowState === 'CHECKING' && (
          <div className="relative z-10 py-8 sm:py-10 flex flex-col items-center text-center space-y-3.5 animate-fade-in">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl overflow-hidden p-[1.5px] bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-500 shadow-sm relative">
                <img src="/app-logo.png" alt="KCET GenZ Logo" className="w-full h-full object-cover rounded-[14px] opacity-75" />
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Verifying Email Address</h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xs">
                Connecting to Firebase Authentication to confirm your KCET GenZ account...
              </p>
            </div>
          </div>
        )}

        {/* ---------------- STATE: SUCCESS ---------------- */}
        {flowState === 'SUCCESS' && (
          <div className="relative z-10 py-2 text-center space-y-4 animate-fade-in">
            <div className="relative inline-block">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
            </div>

            <div className="space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                Verified
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Email Verified!
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xs mx-auto">
                Your KCET GenZ student account has been confirmed. You now have full access to study resources, test series, and mentor chats.
              </p>
            </div>

            {/* Next Steps Guidance */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-1.5">
              <div className="flex items-center space-x-2 text-blue-700 font-semibold text-[11px] uppercase tracking-wider">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Next Step: Return to KCET GenZ App</span>
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                Your account is ready. Open your KCET GenZ Android app to continue learning.
              </p>
            </div>

            {/* Action button */}
            <div className="space-y-2 pt-1">
              {continueUrl ? (
                <a
                  href={continueUrl}
                  className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 h-12 shadow-md shadow-blue-600/25"
                >
                  <span>Continue to KCET GenZ</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <a
                    href="intent://kcet-app/#Intent;scheme=kcet;package=com.kcet.app;end"
                    className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center justify-center space-x-2 h-12 shadow-md shadow-blue-600/25"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Open KCET GenZ App</span>
                  </a>
                  <p className="text-[10px] text-slate-400">
                    You can also return to the app from your home screen.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-1 text-center text-[11px] text-slate-500 flex items-center justify-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Verified securely with Firebase Authentication</span>
            </div>
          </div>
        )}

        {/* ---------------- STATE: ERROR ---------------- */}
        {flowState === 'ERROR' && (
          <div className="relative z-10 py-2 text-center space-y-4 animate-fade-in">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto shadow-sm">
              <AlertTriangle className="w-7 h-7 text-rose-600" />
            </div>

            <div className="space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider">
                Verification Issue
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Link Unavailable
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xs mx-auto leading-relaxed">
                {errorMessage || 'This verification link is invalid or has expired.'}
              </p>
            </div>

            {/* Guidance Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-1.5">
              <div className="flex items-center space-x-1.5 text-[11px] font-semibold uppercase text-slate-700">
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span>How to request a new link:</span>
              </div>
              <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside leading-normal">
                <li>Open the <strong>KCET GenZ App</strong>.</li>
                <li>Go to <strong>Profile / Account Settings</strong>.</li>
                <li>Tap <strong>"Resend Verification Email"</strong>.</li>
              </ol>
            </div>

            {oobCode && (
              <button
                type="button"
                onClick={() => applyVerificationCode(oobCode)}
                className="inline-flex items-center space-x-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors py-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry verification</span>
              </button>
            )}
          </div>
        )}

        {/* ---------------- STATE: INVALID_PARAMS ---------------- */}
        {flowState === 'INVALID_PARAMS' && (
          <div className="relative z-10 py-6 text-center space-y-4 animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto shadow-sm">
              <Mail className="w-7 h-7 text-amber-600" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                KCET GenZ Email Verification
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto">
                This page verifies student email addresses for the KCET GenZ learning platform.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-1.5">
              <div className="flex items-center space-x-1.5 text-[11px] font-semibold uppercase text-slate-700">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Need to verify your email?</span>
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                Please check your inbox or spam folder for an email from <strong>KCET GenZ</strong> and click the <strong>"Verify Email Address"</strong> button.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
