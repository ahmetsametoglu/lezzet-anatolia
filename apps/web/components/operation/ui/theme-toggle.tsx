'use client';

import { useEffect, useState } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

/**
 * Tema anahtarı (sistem · açık · koyu) — tercih `localStorage`'ta, uygulama `<html data-theme>` ile.
 * İlk boyamadaki çözüm `ThemeScript`in işi; burası yalnız değişimi yönetir.
 */
type ThemePref = 'system' | 'light' | 'dark';

const THEME_KEY = 'ops-theme';

/** Tercihi `<html data-theme>`e uygular. `system` → işletim sisteminin o anki teması. */
function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

const ICON_SIZE = 18;

const OPTIONS: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'Sistem', icon: <MonitorIcon size={ICON_SIZE} /> },
  { value: 'light', label: 'Açık', icon: <SunIcon size={ICON_SIZE} /> },
  { value: 'dark', label: 'Koyu', icon: <MoonIcon size={ICON_SIZE} /> },
];

export function ThemeToggle() {
  // Sunucuda tercih bilinmez; ilk render 'system' ile eşleşir, mount'ta gerçek değere düzeltilir.
  const [pref, setPref] = useState<ThemePref>('system');

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as ThemePref | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') setPref(stored);
  }, []);

  // 'system' seçiliyken işletim sistemi teması değişirse anında yansısın (sayfa yenilenmeden).
  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  function choose(next: ThemePref) {
    setPref(next);
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  return (
    <div className="mx-[15px] mt-3 flex flex-col gap-1.5 border-t border-ops-line pt-3">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.15em] text-ops-faint">Tema</span>
      <div className="flex gap-1 rounded-ops-btn bg-ops-line-soft p-[3px]" role="group" aria-label="Tema seçimi">
        {OPTIONS.map((o) => {
          const on = pref === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              aria-pressed={on}
              aria-label={o.label}
              title={o.label}
              className={[
                'flex flex-1 cursor-pointer items-center justify-center rounded-[6px] p-2 transition-colors',
                on ? 'bg-ops-white text-ops-ink shadow-[0_1px_2px_rgba(20,22,18,0.12)]' : 'text-ops-muted hover:text-ops-body',
              ].join(' ')}
            >
              {o.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Boyamadan önce çalışan tema çözücü — yoksa koyu tema seçen her açılışta bir kare açık tema görür.
 * Düz `<script>`, çünkü React hidrasyonundan önce çalışmalı.
 */
export function ThemeScript() {
  const js = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
