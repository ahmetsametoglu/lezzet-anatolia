'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { UserRole } from '@lezzet/types';
import { SearchInput } from './search-input';
import { CommandPalette, useCommandPaletteShortcut } from './command-palette';
import { useOpsShell } from './ops-shell';
import { roleText } from './ops-nav';
import { SearchIcon } from './icons';
import { WarehouseContextPicker } from './warehouse-context-picker';

/**
 * Operasyon sayfa başlık barı (09.19) — **her ekranın paylaştığı TEK üst bant**.
 *
 * ── NEYİ BİRLEŞTİRDİ ─────────────────────────────────────────────────────────
 * Envanter çıkarıldığında bar üç ayrı yerde yaşıyordu: `PageHeader`ın serbest yuvası, `Tabs`ın
 * aksiyon yuvası, ve mobilde üç ekranın elden yazdığı `<div>`ler (farklı yükseklik, farklı yazı
 * kademesi). Bir de tasarım sisteminde başlık barının **numarası yoktu** (`O1` ray, `O2` sekme,
 * `O3` süzgeç var — bar yok), yani ortak bir tanım hiç yapılmamıştı. Bu komponent o tanımdır.
 *
 * ── ÜÇ BLOK, ÜÇ SAHİP ────────────────────────────────────────────────────────
 * 1. **Kimlik** (`title` + `subtitle`) — sayfanın. Alt satır bir slogan değil SAYI: ekranın o an ne
 *    durumda olduğunu söyler ("12 sipariş yolda — kabul bekliyor"). Boş kalabilir; boşken bar
 *    yüksekliği DEĞİŞMEZ, yoksa ekranlar arası geçişte içerik zıplar.
 * 2. **Ekran işleri** (`search` + `actions`) — yine sayfanın. Buraya EKRAN çapında olanlar konur;
 *    sekmeye bağlı kontroller `Tabs`ın `action` yuvasında kalır ve bu bilinçli: orada neden ile
 *    sonuç yan yana durur (ürün ekranında arama her sekmede ÜRÜNDE arıyordu, düğme de neyi
 *    yarattığını belirleyen sekmeden uzaktaydı).
 * 3. **Kabuk** (depo bağlamı · ⌘K · kullanıcı) — sayfanın DEĞİL, oturumun. Bağlamdan gelir
 *    (`useOpsShell`), sayfa bunları hiç bilmez. Üçü de sol raydan devralındı (kullanıcı kararı
 *    02.08: *"orası çok karmaşık ve dolu görünüyor"*) — ray artık yalnız "nereye gidiyorum"
 *    sorusuna kalıyor.
 *
 * ── BAR SAYFANIN İÇİNDE ÇİZİLİR, LAYOUT'TA DEĞİL ─────────────────────────────
 * Başlık ve aksiyonlar sayfaya ait; layout onları bilemez. Alternatif iki barı üst üste koymaktı
 * (üstte genel bloklar, altta başlık) — dikey alanı ikinci kez ödemek ve bu işin sebebinin tam
 * tersi. Kabuk blokları bu yüzden context'ten gelir.
 */
interface PageHeaderProps {
  title: string;
  /** Başlık altındaki özet/sayaç satırı (ör. "86 ürün · 3 aday"). */
  subtitle?: ReactNode;
  /**
   * Ekran araması — verilirse kutu çizilir. HER ekranda yoktur ve olmamalı: paketlerde aranacak
   * veri yok, teklif listesi kısa. Kutunun olmadığı yere kilitli bir kutu konmaz — "birazdan
   * çalışır" der ve yalandır.
   */
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  /** Ekran aksiyonları (+Yeni, araç düğmeleri). En fazla bir BİRİNCİL düğme — fazlası araç çubuğudur. */
  children?: ReactNode;
  /**
   * Dar ekran kademesi — cihaz forkunun mobil dalı verir (`md:` ile akışkan responsive YOK, Sapma 3).
   * Başlık bir kademe küçülür, yatay dolgu daralır, ⌘K kutusu metin yerine tek düğmeye iner.
   */
  compact?: boolean;
}

export function PageHeader({ title, subtitle, search, children, compact = false }: PageHeaderProps) {
  const shell = useOpsShell();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  // Kısayol kabuk varken dinlenir: operasyon dışında (hata ekranı) palet yok, dinleyici de olmasın.
  useCommandPaletteShortcut(shell ? openPalette : NOOP);

  return (
    <>
      <header
        className={[
          'flex flex-wrap items-center gap-3.5 border-b border-ops-line',
          compact ? 'px-4 py-3' : 'px-6 py-4',
        ].join(' ')}
      >
        <div className="mr-auto flex min-w-0 flex-col gap-px">
          <h1
            className={[
              'truncate font-ops-display font-semibold text-ops-ink',
              compact ? 'text-ops-section' : 'text-ops-title',
            ].join(' ')}
          >
            {title}
          </h1>
          {subtitle ? <span className="font-ops-body text-ops-sm text-ops-muted">{subtitle}</span> : null}
        </div>

        {search ? (
          <SearchInput
            value={search.value}
            onChange={search.onChange}
            placeholder={search.placeholder}
            className={compact ? 'w-full order-last' : 'w-[210px]'}
          />
        ) : null}

        {children}

        {/* ── Kabuk blokları ── raydan devralındı; sayfa bunları bilmez. */}
        {shell ? (
          <div className="flex items-center gap-2.5 border-l border-ops-line-soft pl-2.5">
            <WarehouseContextPicker {...shell.warehouse} variant="bar" />
            <PaletteTrigger compact={compact} onOpen={openPalette} />
            <UserBadge email={shell.user.email} roles={shell.user.roles} compact={compact} />
          </div>
        ) : null}
      </header>

      {shell ? (
        <CommandPalette roles={shell.user.roles} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      ) : null}
    </>
  );
}

const NOOP = () => {};

/**
 * ⌘K tetikleyicisi. Geniş ekranda kutu gibi görünür (kısayolu ÖĞRETİR — kimse denemeden bilmez),
 * dar ekranda tek düğmeye iner: telefonda klavye kısayolu diye bir şey yok, kutu yalnız yer kaplardı.
 */
function PaletteTrigger({ compact, onOpen }: { compact: boolean; onOpen: () => void }) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Ekrana git"
        className="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg border border-ops-line-strong text-ops-faint transition-colors hover:border-ops-olive hover:text-ops-olive"
      >
        <SearchIcon />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-ops-gray-300 bg-ops-line px-2.5 py-[7px] text-ops-faint transition-colors hover:border-ops-olive hover:text-ops-olive"
    >
      <SearchIcon />
      <span className="font-ops-body text-ops-sm">Ekrana git…</span>
      <kbd className="rounded border border-ops-line-strong px-1 font-ops-mono text-ops-micro">⌘K</kbd>
    </button>
  );
}

/**
 * Kullanıcı künyesi — baş harf + kim + roller.
 *
 * Dar ekranda yalnız baş harf kalır: ad ve rol satırı orada başlığın yerini yiyordu. Bilgi kaybı
 * değil — `title` ile erişilebilir kalıyor ve mobilde "ben kimim" nadiren sorulan bir sorudur.
 */
function UserBadge({ email, roles, compact }: { email: string; roles: readonly UserRole[]; compact: boolean }) {
  const local = email.split('@')[0] || 'personel';
  const initials = local.slice(0, 2).toLocaleUpperCase('tr');
  const label = roleText(roles);
  return (
    <span className="flex items-center gap-2" title={`${local} · ${label}`}>
      <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-ops-olive font-ops-display text-ops-sm font-semibold text-ops-card">
        {initials}
      </span>
      {compact ? null : (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{local}</span>
          <span className="font-ops-body text-ops-micro text-ops-muted">{label}</span>
        </span>
      )}
    </span>
  );
}
