import React, { useState, useEffect } from 'react';
import { 
  verifyPasswordResetCode, 
  confirmPasswordReset 
} from 'firebase/auth';
import { auth, authDomain } from '../firebase';
import PasswordStrengthMeter, { checkPasswordStrength } from './PasswordStrengthMeter';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  RefreshCw, 
  Mail, 
  Smartphone, 
  ShieldCheck, 
  ExternalLink,
  HelpCircle,
  Info
} from 'lucide-react';

export default function PasswordResetCard({ onStateChange }) {
  // Query parameters state
  const [mode, setMode] = useState('');
  const [oobCode, setOobCode] = useState('');
  const [continueUrl, setContinueUrl] = useState('');

  // Flow states: 'CHECKING' | 'READY' | 'SUBMITTING' | 'SUCCESS' | 'ERROR' | 'REDIRECTING' | 'NO_PARAMS'
  const [flowState, setFlowState] = useState('CHECKING');
  const [accountEmail, setAccountEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');

  // Form fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState('');

  // Helper to sync state with parent App component for watermark visibility
  const updateFlowState = (newState) => {
    setFlowState(newState);
    if (onStateChange) {
      onStateChange(newState);
    }
  };

  // Read URL parameters on mount
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlMode = searchParams.get('mode') || '';
      const urlOobCode = searchParams.get('oobCode') || '';
      const urlContinueUrl = searchParams.get('continueUrl') || '';

      setMode(urlMode);
      setOobCode(urlOobCode);
      setContinueUrl(urlContinueUrl);

      // Scenario 1: No query parameters provided -> show official portal landing
      if (!urlMode && !urlOobCode) {
        updateFlowState('NO_PARAMS');
        return;
      }

      // Scenario 2: verifyEmail, recoverEmail, or any non-password-reset actions
      // Automatically redirect the user to Firebase's original default handler:
      // https://<authDomain>/__/auth/action?mode=...&oobCode=...
      // Preserving all original query parameters (oobCode, apiKey, mode, lang, continueUrl, etc.)
      if (urlMode && urlMode !== 'resetPassword') {
        const defaultHandler = `https://${authDomain}/__/auth/action${window.location.search}`;
        setRedirectUrl(defaultHandler);
        updateFlowState('REDIRECTING');
        window.location.replace(defaultHandler);
        return;
      }

      // Scenario 3: Missing action code for password reset
      if (urlMode === 'resetPassword' && !urlOobCode) {
        updateFlowState('ERROR');
        setErrorCode('auth/missing-action-code');
        setErrorMessage('The password reset link is incomplete or missing a security action code.');
        return;
      }

      // Scenario 4: Validate action code with Firebase Authentication
      validateResetCode(urlOobCode);
    } catch (err) {
      updateFlowState('ERROR');
      setErrorCode('client/url-parse-error');
      setErrorMessage('Unable to process the reset link. Please check your browser address bar.');
    }
  }, []);

  // Validate the oobCode via Firebase SDK
  const validateResetCode = async (code) => {
    updateFlowState('CHECKING');
    setErrorMessage('');
    setErrorCode('');

    try {
      // Firebase Modular SDK: verifyPasswordResetCode(auth, code)
      const email = await verifyPasswordResetCode(auth, code);
      setAccountEmail(email);
      updateFlowState('READY');
    } catch (err) {
      updateFlowState('ERROR');
      setErrorCode(err.code || 'unknown');

      switch (err.code) {
        case 'auth/expired-action-code':
          setErrorMessage('This password reset link has expired. For your account security, reset links are valid only for a limited time.');
          break;
        case 'auth/invalid-action-code':
          setErrorMessage('This password reset link is invalid or has already been used. Please request a fresh reset link from the KCET App.');
          break;
        case 'auth/user-disabled':
          setErrorMessage('This user account has been disabled. Please contact KCET App administration.');
          break;
        case 'auth/user-not-found':
          setErrorMessage('No active user account found matching this reset request.');
          break;
        case 'auth/network-request-failed':
          setErrorMessage('Network connection error. Please verify your internet connection and try again.');
          break;
        default:
          setErrorMessage(err.message || 'Unable to verify this password reset link. Please try again.');
          break;
      }
    }
  };

  // Handle password submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    // Client-side validations
    if (!newPassword) {
      setFormError('Please enter a new password.');
      return;
    }

    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters in length.');
      return;
    }

    const { isSatisfied } = checkPasswordStrength(newPassword);
    if (!isSatisfied) {
      setFormError('Please choose a stronger password meeting the security guidelines below.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match. Please verify both fields.');
      return;
    }

    // Submit flow to Firebase Authentication
    updateFlowState('SUBMITTING');

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      updateFlowState('SUCCESS');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      updateFlowState('READY');
      setErrorCode(err.code || '');

      switch (err.code) {
        case 'auth/weak-password':
          setFormError('Firebase rejected this password because it is too weak. Please include numbers, symbols, and mixed case letters.');
          break;
        case 'auth/expired-action-code':
          updateFlowState('ERROR');
          setErrorMessage('This reset code expired before completion. Please request a new link from the KCET App.');
          break;
        case 'auth/invalid-action-code':
          updateFlowState('ERROR');
          setErrorMessage('This reset link has already been used or is invalid. Please request a new link.');
          break;
        case 'auth/network-request-failed':
          setFormError('Network timeout. Please check your internet connection and retry.');
          break;
        default:
          setFormError(err.message || 'Failed to update password. Please try again.');
          break;
      }
    }
  };

  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto">
      <div className="bg-white/92 backdrop-blur-md rounded-2xl p-5 sm:p-7 border border-slate-200/80 shadow-xl shadow-slate-200/40 relative overflow-hidden transition-all duration-300">
        
        {/* Subtle decorative top accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-sky-400 to-indigo-500 z-20" />

        {/* ---------------- STATE: CHECKING LINK ---------------- */}
        {flowState === 'CHECKING' && (
          <div className="relative z-10 py-8 sm:py-10 flex flex-col items-center text-center space-y-3.5 animate-fade-in">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl overflow-hidden p-[1.5px] bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-500 shadow-sm relative">
                <img src="/app-logo.png" alt="KCET App Logo" className="w-full h-full object-cover rounded-[14px] opacity-75" />
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Verifying Reset Link</h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xs">
                Authenticating your security link with Firebase...
              </p>
            </div>
          </div>
        )}

        {/* ---------------- STATE: READY / SUBMITTING (FORM PAGE) ---------------- */}
        {(flowState === 'READY' || flowState === 'SUBMITTING') && (
          <div className="relative z-10 space-y-4 animate-fade-in">
            {/* Header */}
            <div className="text-center space-y-1.5">
              <div className="relative inline-block mx-auto mb-1">
                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden p-[1.5px] bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-500 shadow-md shadow-blue-500/15">
                  <img src="/app-logo.png" alt="KCET App Logo" className="w-full h-full object-cover rounded-[14px]" />
                </div>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Reset Password
              </h1>
              <p className="text-xs text-slate-500">
                Create a secure new password for your KCET account.
              </p>

              {accountEmail && (
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] text-slate-700 font-mono mt-1 max-w-full">
                  <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate">{accountEmail}</span>
                </div>
              )}
            </div>

            {/* Form Error Banner */}
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2 animate-slide-up">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-snug">{formError}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* New Password Input */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700 tracking-wider uppercase">
                  New Password
                </label>
                <div className="relative rounded-xl shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={flowState === 'SUBMITTING'}
                    placeholder="Enter at least 8 characters"
                    autoComplete="new-password"
                    className="w-full pl-9 pr-10 py-2.5 sm:py-3 bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-base sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition-all duration-200 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    disabled={flowState === 'SUBMITTING'}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                <PasswordStrengthMeter password={newPassword} />
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-1 pt-0.5">
                <label className="block text-[11px] font-semibold text-slate-700 tracking-wider uppercase">
                  Confirm Password
                </label>
                <div className="relative rounded-xl shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={flowState === 'SUBMITTING'}
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    className={`w-full pl-9 pr-10 py-2.5 sm:py-3 rounded-xl text-base sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition-all duration-200 disabled:opacity-50 ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'bg-rose-50/50 border border-rose-300 focus:ring-4 focus:ring-rose-100'
                        : confirmPassword && confirmPassword === newPassword
                        ? 'bg-emerald-50/40 border border-emerald-300 focus:ring-4 focus:ring-emerald-100'
                        : 'bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-600'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={flowState === 'SUBMITTING'}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">Passwords do not match</p>
                )}
                {confirmPassword && confirmPassword === newPassword && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center space-x-1 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Passwords match</span>
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={flowState === 'SUBMITTING' || !newPassword || !confirmPassword}
                  className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all duration-200 shadow-md shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center space-x-2 h-12"
                >
                  {flowState === 'SUBMITTING' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Saving in Firebase...</span>
                    </>
                  ) : (
                    <>
                      <span>Reset Password</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="pt-1 text-center text-[11px] text-slate-500 flex items-center justify-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Applied instantly to your KCET account</span>
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
                Success
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Password Changed!
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xs mx-auto">
                Your KCET App password has been updated in Firebase Authentication.
              </p>
            </div>

            {/* Back to Android App Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-1.5">
              <div className="flex items-center space-x-2 text-blue-700 font-semibold text-[11px] uppercase tracking-wider">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Next: Open KCET App</span>
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                Open your KCET Android App on your device and sign in with your new password.
              </p>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              {continueUrl ? (
                <a
                  href={continueUrl}
                  className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 h-12 shadow-md shadow-blue-600/25"
                >
                  <span>Continue to KCET App</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <a
                    href="intent://kcet-app/#Intent;scheme=kcet;package=com.kcet.app;end"
                    className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center justify-center space-x-2 h-12 shadow-md shadow-blue-600/25"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Open KCET App</span>
                  </a>
                  <p className="text-[10px] text-slate-400">
                    Or return to the app from your phone's home screen.
                  </p>
                </div>
              )}
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
                Expired or Invalid
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Reset Link Unavailable
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xs mx-auto leading-relaxed">
                {errorMessage || 'This password reset link is invalid or has expired.'}
              </p>
            </div>

            {/* Guidance Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-1.5">
              <div className="flex items-center space-x-1.5 text-[11px] font-semibold uppercase text-slate-700">
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span>How to get a new link:</span>
              </div>
              <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside leading-normal">
                <li>Open the <strong>KCET Android App</strong>.</li>
                <li>Tap <strong>"Forgot Password"</strong> on login.</li>
                <li>Submit your email to get a new link.</li>
              </ol>
            </div>

            {oobCode && (
              <button
                type="button"
                onClick={() => validateResetCode(oobCode)}
                className="inline-flex items-center space-x-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors py-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry verification</span>
              </button>
            )}
          </div>
        )}

        {/* ---------------- STATE: REDIRECTING (FOR VERIFYEMAIL, RECOVEREMAIL, ETC.) ---------------- */}
        {flowState === 'REDIRECTING' && (
          <div className="relative z-10 py-8 sm:py-10 flex flex-col items-center text-center space-y-3.5 animate-fade-in">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl overflow-hidden p-[1.5px] bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-500 shadow-sm relative">
                <img src="/app-logo.png" alt="KCET App Logo" className="w-full h-full object-cover rounded-[14px] opacity-75" />
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Redirecting to Firebase
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xs">
                Taking you to Firebase's official handler for <span className="font-semibold text-blue-600">{mode === 'verifyEmail' ? 'Email Verification' : mode === 'recoverEmail' ? 'Email Recovery' : mode || 'email action'}</span>...
              </p>
            </div>

            {redirectUrl && (
              <a
                href={redirectUrl}
                className="text-xs text-blue-600 hover:text-blue-700 underline font-medium pt-2"
              >
                Click here if not redirected automatically
              </a>
            )}
          </div>
        )}

        {/* ---------------- STATE: NO_PARAMS (MOBILE LANDING) ---------------- */}
        {flowState === 'NO_PARAMS' && (
          <div className="relative z-10 py-2 text-center space-y-4 animate-fade-in">
            <div className="relative inline-block mx-auto">
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl overflow-hidden p-[2px] bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-500 shadow-md shadow-blue-500/20">
                <img src="/app-logo.png" alt="KCET App Logo" className="w-full h-full object-cover rounded-[14px]" />
              </div>
            </div>

            <div className="space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                Official Security Portal
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                KCET Password Reset
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xs mx-auto">
                Official password reset portal for the KCET Android Application.
              </p>
            </div>

            {/* Instruction steps */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-2">
              <div className="text-[11px] font-semibold uppercase text-blue-700 flex items-center space-x-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>How to reset your password:</span>
              </div>
              <ul className="text-xs text-slate-600 space-y-1.5">
                <li className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">1</span>
                  <span>Open the <strong>KCET App</strong> on your phone.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">2</span>
                  <span>Tap <strong>"Forgot Password"</strong> on sign-in.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">3</span>
                  <span>Tap the link in your email to open this page and set your new password.</span>
                </li>
              </ul>
            </div>

            <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-200/60 text-blue-800 text-[11px]">
              Direct access without a reset code is restricted for your account security.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
