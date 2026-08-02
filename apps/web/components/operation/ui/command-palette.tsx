'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { UserRole } from '@lezzet/types';
import { NavIcon, SearchIcon } from './icons';
import { isActive, sectionsFor, type NavItem } from './ops-nav';

/**
 * ⌘K — hızlı EKRAN GEÇİŞİ.
 *
 * ── NE YAPTIĞINI SÖYLÜYOR, FAZLASINI DEĞİL ───────────────────────────────────
 * Rayda bir yıllık "Ara…" kutusu duruyordu ve **hiçbir şey yapmıyordu**: görsel bir yer tutucuydu.
 * Başlık barına taşınırken iki yol vardı — ölü hâliyle taşımak ya da işlevini vermek. Ölü kontrolü
 * yeni bir komponente taşımak, yalanı temize çekmek olurdu (`CLAUDE.md §3`: ölü düğme konmaz).
 *
 * O yüzden tek ve gerçek bir iş yapıyor: **ekrana git.** Kayıt araması DEĞİL — sipariş, müşteri ya
 * da ürün aramak isteyen kendi ekranının arama kutusunu kullanır ve o kutular zaten var. İkisini
 * tek kutuda toplamak, "yazdığım şey nerede aranıyor" sorusunu her seferinde belirsiz bırakırdı.
 * Yer tutucu metni bunu açıkça yazar.
 *
 * ── ROLE GÖRE ────────────────────────────────────────────────────────────────
 * Liste `sectionsFor(roles)` — rayla AYNI kaynak. Depocu palette Fiyatlar'ı göremez, çünkü rayda da
 * göremiyor; iki liste ayrışsaydı palet kapalı bir kapıyı önerirdi.
 *
 * ── KLAVYE ───────────────────────────────────────────────────────────────────
 * ⌘K / Ctrl+K açar, Esc kapar, ↑↓ gezer, Enter gider. Fare de çalışır ama asıl kullanıcı klavyedir:
 * bu kontrolün var olma sebebi rayı taramadan ekran değiştirmek.
 */
interface CommandPaletteProps {
  roles: readonly UserRole[];
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ roles, open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rayla aynı kaynak; bölüm başlığı sonuçta da görünür ("Depo › Stok") çünkü iki ekran benzer ada
  // sahip olabilir ve grup onu ayırır.
  const items = useMemo(
    () => sectionsFor(roles).flatMap((s) => s.items.map((item) => ({ item, section: s.label }))),
    [roles],
  );

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return items;
    // Arama ETİKETTE ve bölüm adında; yol (`href`) aranmaz — operatör "/operations/stock" yazmaz.
    return items.filter(
      (r) =>
        r.item.label.toLocaleLowerCase('tr').includes(q) || r.section.toLocaleLowerCase('tr').includes(q),
    );
  }, [items, query]);

  // Açılışta kutu temizlenir ve odaklanır: palet bir önceki aramanın kalıntısıyla açılmamalı.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    // Odak bir kare sonra: panel henüz boyanmamışken `focus()` düşer.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // İmleç sonuç kümesi daraldığında dışarı taşmasın.
  useEffect(() => setCursor((c) => Math.min(c, Math.max(0, results.length - 1))), [results.length]);

  if (!open) return null;

  const go = (item: NavItem) => {
    onClose();
    router.push(item.href);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ops-scrim px-4 pt-[12vh]"
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ekrana git"
        className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-ops-card border border-ops-line bg-ops-card shadow-lg"
        onKeyDown={(e) => {
          if (e.key === 'Escape') return onClose();
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => {
              const next = c + (e.key === 'ArrowDown' ? 1 : -1);
              return (next + results.length) % Math.max(1, results.length);
            });
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const hit = results[cursor];
            if (hit) go(hit.item);
          }
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-ops-line px-4 py-3">
          <span className="text-ops-faint">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Yer tutucu ne ARAMADIĞINI da söylüyor: bu kutu kayıt bulmaz, ekran açar.
            placeholder="Ekrana git — sipariş/müşteri araması ekranın kendi kutusunda"
            className="flex-1 bg-transparent font-ops-body text-ops-base text-ops-ink outline-none placeholder:text-ops-faint"
          />
          <kbd className="rounded border border-ops-line-strong px-1.5 py-0.5 font-ops-mono text-ops-micro text-ops-muted">
            esc
          </kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-6 text-center font-ops-body text-ops-sm text-ops-muted">
            Eşleşen ekran yok. Aradığınız ekran rolünüze kapalı olabilir.
          </p>
        ) : (
          <ul className="max-h-[320px] overflow-y-auto py-1.5">
            {results.map((r, i) => {
              const on = i === cursor;
              const current = isActive(pathname, r.item.href);
              return (
                <li key={r.item.href}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(r.item)}
                    aria-current={current ? 'page' : undefined}
                    className={[
                      'flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left transition-colors',
                      on ? 'bg-ops-olive-bg' : '',
                    ].join(' ')}
                  >
                    <span className={on ? 'text-ops-olive-dark' : 'text-ops-faint'}>
                      <NavIcon name={r.item.key} />
                    </span>
                    <span className="flex-1 font-ops-display text-ops-base font-medium text-ops-ink">
                      {r.item.label}
                    </span>
                    {/* Bulunduğu ekran işaretlenir: palet "zaten oradasın" diyebilmeli. */}
                    {current ? <span className="font-ops-body text-ops-xs text-ops-muted">buradasınız</span> : null}
                    <span className="font-ops-body text-ops-xs text-ops-faint">{r.section}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * ⌘K / Ctrl+K kısayolunu dinler.
 *
 * Kanca ayrı: kısayol UYGULAMA düzeyinde bir davranış, paletin kendisi bir panel. Dinleyiciyi panelin
 * içine koysaydık panel kapalıyken dinleyen kimse olmazdı — yani kısayol yalnız açıkken çalışırdı.
 */
export function useCommandPaletteShortcut(onOpen: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}
