import React from 'react';
import { Check } from 'lucide-react';

export function checkPasswordStrength(password) {
  const requirements = [
    { label: '8+ chars', fullLabel: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Uppercase', fullLabel: 'Uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Lowercase', fullLabel: 'Lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'Number', fullLabel: 'Number (0-9)', met: /[0-9]/.test(password) },
    { label: 'Special symbol', fullLabel: 'Special symbol (!@#$%^&*)', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const metCount = requirements.filter(r => r.met).length;

  let score = 0;
  let label = 'Very Weak';
  let color = 'bg-rose-500';
  let textColor = 'text-rose-600';

  if (password.length === 0) {
    score = 0;
    label = 'None';
    color = 'bg-slate-200';
    textColor = 'text-slate-400';
  } else if (metCount <= 2) {
    score = 1;
    label = 'Weak';
    color = 'bg-rose-500';
    textColor = 'text-rose-600';
  } else if (metCount === 3) {
    score = 2;
    label = 'Fair';
    color = 'bg-amber-500';
    textColor = 'text-amber-600';
  } else if (metCount === 4) {
    score = 3;
    label = 'Good';
    color = 'bg-sky-500';
    textColor = 'text-sky-600';
  } else if (metCount === 5) {
    score = 4;
    label = 'Strong';
    color = 'bg-emerald-500';
    textColor = 'text-emerald-600';
  }

  const isSatisfied = password.length >= 8 && metCount >= 3;

  return { requirements, metCount, score, label, color, textColor, isSatisfied };
}

export default function PasswordStrengthMeter({ password }) {
  const { requirements, score, label, color, textColor } = checkPasswordStrength(password);

  if (!password) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1.5 animate-fade-in">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Password Strength</span>
          <span className={`font-semibold tracking-wide ${textColor}`}>
            {label}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`h-full rounded-full transition-all duration-300 ${
                score >= step ? color : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Requirements checklist pills */}
      <div className="flex flex-wrap gap-1 pt-1">
        {requirements.map((req, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              req.met
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium'
                : 'bg-slate-50 text-slate-500 border border-slate-200'
            }`}
          >
            {req.met ? (
              <Check className="w-2.5 h-2.5 shrink-0 text-emerald-600" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 inline-block" />
            )}
            <span>{req.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
