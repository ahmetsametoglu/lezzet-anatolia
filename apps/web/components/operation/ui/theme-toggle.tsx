'use client';

import { useEffect, useState } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

/**
 * Tema anahtarı — operasyon sidebar'ının dibinde. Üç değerli: sistem · açık · koyu.
 * Karanlık palet yalnız operasyon yüzeyindedir (globals.css §0.6), bu yüzden komponent de burada.
 *
 * Tercih `localStorage`'ta yaşar; uygulama `<html data-theme>` yazılarak yapılır — CSS tek blok
 * tutar, koyu değerler iki kez yazılmaz. İlk boyamadan önce çözüm `ThemeScript` (layout `<head>`)
 * tarafından yapılır; burası yalnız değişimi yönetir, aksi halde sayfa açılışında açık tema
 * bir kare görünür (FOUC).
 */
type ThemePref = 'system' | 'light' | 'dark';

const THEME_KEY = 'ops-theme';

/** Tercihi `<html data-theme>`e uygular. `system` → işletim sisteminin o anki teması. */
function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

const OPTIONS: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'Sistem', icon: <MonitorIcon /> },
  { value: 'light', label: 'Açık', icon: <SunIcon /> },
  { value: 'dark', label: 'Koyu', icon: <MoonIcon /> },
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
              title={o.label}
              className={[
                'flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-[6px] py-[5px] font-ops-display text-ops-micro font-semibold transition-colors',
                on ? 'bg-ops-white text-ops-ink shadow-[0_1px_2px_rgba(20,22,18,0.12)]' : 'text-ops-muted hover:text-ops-body',
              ].join(' ')}
            >
              {o.icon}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Boyamadan ÖNCE çalışan tema çözücü — `<head>`e girer, `data-theme`i ilk HTML ile birlikte yazar.
 * Aksi halde koyu tema seçili kullanıcı her sayfa açılışında bir kare açık tema görür.
 * `next/script` değil düz `<script>`: React hidrasyonundan önce çalışması gerekir.
 */
export function ThemeScript() {
  const js = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
