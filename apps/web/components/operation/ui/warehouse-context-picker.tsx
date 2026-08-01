'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { Warehouse } from '@lezzet/types';
import { setWarehouseContextAction } from '@/app/(operations)/operations/actions';
import { AnchoredMenu } from './anchored-menu';
import { CheckIcon, ChevronDownIcon, WarehouseIcon } from './icons';

/**
 * O3B · Depo bağlamı seçici — "hangi evrende çalışıyorum" (19.5).
 *
 * Sidebar'da markanın hemen ALTINDA durur, aramadan önce: bütün sayfanın anlamını o belirler.
 * Tablo süzgeciyle KARIŞTIRILMAZ (sözleşme §7: iki kontrol tek görsel öğede birleşmez) — bu
 * kimlik düzeyinde bir tercihtir, çerezde yaşar, URL'e yazılmaz ve oturumlar arası hatırlanır.
 *
 * DÖRT HÂL, biri hiçbir şey çizmez:
 * - depo-üstü rol (admin/muhasebe) → "Tüm depolar" + her aktif depo
 * - çok kapsamlı personel → kapsamıyla sınırlı liste ("tümü" = kapsamımdakiler)
 * - tek kapsamlı personel → **seçici yok**, yalnız deposunun adı; bu bilgidir, kontrol değil
 * - tek aktif depo kurulumu → **hiçbir şey**; eksen ikinci depo eklendiği gün kendiliğinden belirir
 *
 * Renk bilgi mavisi, olive değil: depo bir karar değil bir bakıştır (bkz. `TriggerTone`).
 */
export interface WarehouseContextPickerProps {
  /** Kapsamla süzülmüş aktif depolar — kapsam dışı depo burada YOKTUR (sözleşme kural 8). */
  warehouses: Warehouse[];
  /** Seçili depo; "tüm depolar" iken null. */
  activeWarehouseId: string | null;
  /** Depo-üstü rol mü — "Tüm depolar" seçeneğinin metnini belirler ("kapsamım" değil). */
  unscoped: boolean;
}

const ALL = 'all';

export function WarehouseContextPicker({ warehouses, activeWarehouseId, unscoped }: WarehouseContextPickerProps) {
  const router = useRouter();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Tek depo = seçilecek bir şey yok. Sayfa bugünkü hâlinden farksız görünür ve bu BİLİNÇLİ bir
  // durumdur: eksen ikinci depoyla birlikte doğar (sözleşme §6).
  const only = warehouses.length === 1 ? warehouses[0] : null;
  if (warehouses.length < 2) {
    // Depo-üstü rolde tek depo = "tek depolu kurulum" → hiçbir şey. Kapsamlı personelde aynı sayı
    // "benim depom" demek → adı künye olarak durur.
    return only && !unscoped ? <FixedWarehouse name={only.name} /> : null;
  }

  const active = warehouses.find((w) => w.id === activeWarehouseId) ?? null;
  const subtitle = active
    ? active.code
    : unscoped
      ? `${warehouses.length} aktif depo · ${warehouses.map((w) => w.code).join(' · ')}`
      : `kapsamım · ${warehouses.length} depo`;

  const pick = (value: string) => {
    setOpen(false);
    if (value === (activeWarehouseId ?? ALL)) return;
    startTransition(async () => {
      await setWarehouseContextAction(value);
      // Bağlam değişince tablo depo SÜZGECİ temizlenir (sözleşme kural 2): tek elemanlı bir
      // evrende süzgecin işi yoktur ve "Tüm depolar"a dönüşte eski seçim hatırlanmaz — hatırlanan
      // süzgeç "neden eksik görüyorum" sürprizinin kaynağıdır. Diğer süzgeçler (durum, kategori,
      // dönem) KORUNUR; onlar depo ekseni değildir.
      router.replace(withoutWarehouseFilter(window.location.href), { scroll: false });
    });
  };

  return (
    <div className="mx-4 mb-2 flex flex-col gap-1">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.15em] text-ops-faint">
        Depo bağlamı
      </span>
      <div ref={anchorRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={pending}
          className={[
            'flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-ops-white px-2.5 py-[7px] text-left outline-none transition-colors',
            open ? 'border-ops-blue-line' : 'border-ops-line-strong hover:border-ops-blue-line',
            pending ? 'cursor-wait opacity-60' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="flex-none text-ops-blue">
            <WarehouseIcon />
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">
              {active ? active.name : 'Tüm depolar'}
            </span>
            <span className="truncate font-ops-mono text-ops-micro text-ops-muted">{subtitle}</span>
          </span>
          <span className="flex-none text-ops-faint">
            <ChevronDownIcon />
          </span>
        </button>
      </div>

      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width="anchor">
        <div role="listbox">
          <Option
            label="Tüm depolar"
            meta={unscoped ? 'ağın tamamı' : 'kapsamımdaki depolar'}
            selected={activeWarehouseId === null}
            onPick={() => pick(ALL)}
          />
          {warehouses.map((w) => (
            <Option
              key={w.id}
              label={w.name}
              meta={w.code}
              selected={w.id === activeWarehouseId}
              onPick={() => pick(w.id)}
            />
          ))}
        </div>
      </AnchoredMenu>
    </div>
  );
}

/**
 * URL'den depo süzgecini düşür — bağlam değişiminin ikinci yarısı.
 *
 * Yalnız `depo` anahtarı silinir; sayfanın geri kalanı (sekme, arama, kategori, dönem) aynen kalır.
 * Adres tam olarak yeniden kurulur çünkü `router.replace` göreli yol bekler.
 */
function withoutWarehouseFilter(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('depo');
  return `${url.pathname}${url.search}`;
}

/** Tek kapsamlı personel — seçici YOK. Depocuya depo seçtirilmez; deposunun adı bir künyedir. */
function FixedWarehouse({ name }: { name: string }) {
  return (
    <div className="mx-4 mb-2 flex items-center gap-2 px-0.5 py-1 text-ops-faint">
      <span className="flex-none">
        <WarehouseIcon />
      </span>
      <span className="truncate font-ops-body text-ops-sm text-ops-muted">{name}</span>
    </div>
  );
}

interface OptionProps {
  label: string;
  meta: string;
  selected: boolean;
  onPick: () => void;
}

function Option({ label, meta, selected, onPick }: OptionProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={[
        'flex w-full cursor-pointer items-center gap-2.5 px-[13px] py-2 text-left transition-colors',
        selected ? 'bg-ops-blue-bg' : 'hover:bg-ops-subtle',
      ].join(' ')}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className={`truncate font-ops-body text-ops-sm ${selected ? 'font-semibold text-ops-ink' : 'text-ops-strong'}`}>
          {label}
        </span>
        <span className="truncate font-ops-mono text-ops-micro text-ops-muted">{meta}</span>
      </span>
      {selected ? (
        <span className="flex-none text-ops-blue-dark">
          <CheckIcon size={14} />
        </span>
      ) : null}
    </button>
  );
}
