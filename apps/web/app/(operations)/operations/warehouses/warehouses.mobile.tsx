'use client';

import { Badge } from '@/components/operation/ui/badge';
import { CopyIcon } from '@/components/operation/ui/icons';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { PageHeader } from '@/components/operation/ui/page-header';
import { money, num, shortDateTime } from '@/components/operation/ui/format';
import { addressLines, statusLabel, statusTone } from './warehouses-labels';
import { ShippingGapBanner } from './warehouses-sections';
import type { WarehousesViewProps } from './warehouses.desktop';
import type { WarehouseCardView, WarehouseRowView } from './warehouses-types';

// Depolar — mobil: **OKUMA.**
//
// Sahada sorulan şey künyedir: kod, adres, kim çalışıyor. Kapatma, künye düzenleme ve bölge kurulumu
// telefonda YOK ve bu bir eksiklik değil karar (`design/pages/admin-depolar.md §7`): sonucu stoğa,
// bölgelere ve personele aynı anda dokunan bir kararın kazara verilebilmesi gerekmez. Bölge kurulumu
// da masa işidir — koridor seçimi haritada, harita da masada yapılır.
//
// Karne burada da var ama karar kapısı değil: sayı Stok'a götürür, karar orada verilir.

export function WarehousesMobile({ data, navPending, onSelect }: WarehousesViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title={data.card ? data.card.row.name : 'Depolar'}
        // Hâl barın başlık yuvasında — kartın içinde ikinci kez çizilmiyordu ama çizilmek üzereydi;
        // bir durumun tek yeri olur (web ile aynı karar).
        status={data.card ? <Badge tone={statusTone(data.card.row)}>{statusLabel(data.card.row)}</Badge> : null}
        subtitle={data.card ? data.card.row.code : `${data.rows.length} tesis`}
        compact
      />
      <ShippingGapBanner countries={data.countriesWithoutShipping} />

      <div
        aria-busy={navPending || undefined}
        className={['min-h-0 flex-1 overflow-y-auto', navPending ? 'pointer-events-none opacity-60' : ''].join(' ')}
      >
        {data.card ? (
          <FacilityCard card={data.card} onBack={() => onSelect('')} />
        ) : (
          <div className="flex flex-col">
            {data.rows.map((row) => (
              <FacilityRow key={row.id} row={row} onOpen={() => onSelect(row.code)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Liste satırı — telefonda tek soru: hangi tesis, ne durumda. Sayılar kartın içinde. */
function FacilityRow({ row, onOpen }: { row: WarehouseRowView; onOpen: () => void }) {
  return (
    <article
      onClick={onOpen}
      className={[
        'flex cursor-pointer flex-col gap-1.5 border-b border-ops-line-soft px-4 py-3 active:bg-ops-subtle',
        row.isActive ? '' : 'opacity-70',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="flex-none font-ops-mono text-ops-sm font-semibold text-ops-ink">{row.code}</span>
        <span className="mr-auto truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.name}</span>
        <Badge tone={statusTone(row)}>{statusLabel(row)}</Badge>
      </div>
      <span className="font-ops-body text-ops-xs text-ops-muted">
        {COUNTRY_LABELS[row.countryCode]}
        {row.shipsOnline ? ' · kargo çıkışı' : ''}
        {row.activeZoneCount > 0 ? ` · ${row.activeZoneCount} bölge` : ''}
        {row.staffCount > 0 ? ` · ${row.staffCount} personel` : ''}
      </span>
    </article>
  );
}

function FacilityCard({ card, onBack }: { card: WarehouseCardView; onBack: () => void }) {
  const { row, staff, scorecard } = card;
  const lines = addressLines(row.address, row.countryCode);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-ops-line px-4 py-3.5">
        <button type="button" onClick={onBack} className="cursor-pointer self-start font-ops-body text-ops-sm text-ops-olive">
          ← Tesisler
        </button>

        {/* Kod KOPYALANABİLİR: belge önekidir ve sistem dışına elle taşınır (imha tutanağı, transfer). */}
        <CopyRow value={row.code} mono label="Kod" />
        <span className="font-ops-body text-ops-xs text-ops-muted">
          Belge öneki: IMH-{row.code}-… · TRF-{row.code}-… — kâğıt klasör bu tesiste durur.
        </span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-col gap-1">
          <SectionLabel>Adres</SectionLabel>
          {lines ? (
            <CopyRow value={lines.join('\n')} display={lines} label="Adres" />
          ) : (
            <span className="font-ops-body text-ops-sm text-ops-amber">Adres girilmedi — irsaliye ve yazışma için gerekli.</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-ops-line-soft pt-2.5">
          <SectionLabel>Kapsamında bu depo olan personel</SectionLabel>
          {staff.length === 0 ? (
            <span className="font-ops-body text-ops-sm text-ops-amber">Kimse yok — mal kabul ve hazırlık yapılamaz.</span>
          ) : (
            staff.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 py-1">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-ops-btn bg-ops-line-soft font-ops-display text-ops-micro font-semibold text-ops-body">
                  {initialsOf(p.name)}
                </span>
                <span className="flex-1 truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{p.name}</span>
                <span className="font-ops-body text-ops-xs text-ops-muted">{p.roleText}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-ops-line-soft pt-2.5">
          <SectionLabel>Karne — sahada bakılır, karar verilmez</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <MiniTile value={num(scorecard.variantCount)} note={`varyant · ${num(scorecard.batchCount)} parti`} />
            <MiniTile
              tone="amber"
              value={num(scorecard.nearExpiryCount)}
              note={`yaklaşan tarihli${scorecard.riskCents === null ? '' : ` · ${money(scorecard.riskCents)}`}`}
            />
            <MiniTile tone="red" value={num(scorecard.belowMinCount)} note="eşik altı varyant" />
            <MiniTile
              tone="blue"
              value={`${num(scorecard.inTransitIn)} / ${num(scorecard.inTransitOut)}`}
              note="yolda gelen / giden"
            />
          </div>
          <span className="font-ops-body text-ops-micro leading-relaxed text-ops-muted">
            Son mal girişi: {scorecard.lastIntakeAt ? shortDateTime(scorecard.lastIntakeAt) : 'hiç giriş yok'}. Sayıya
            dokunmak Stok'a götürür (bağlam {row.code}) — karar orada verilir.
          </span>
        </div>

        <div className="rounded-ops-btn border border-ops-line bg-ops-line-soft px-3 py-2.5 font-ops-body text-ops-sm leading-relaxed text-ops-body">
          Kapatma / yeniden açma, künye düzenleme ve bölge kurulumu <strong>web'de</strong> yapılır — sonucu stoğa,
          bölgelere ve personele aynı anda dokunur.
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-ops-display text-ops-micro font-medium uppercase tracking-wide text-ops-muted">{children}</span>
  );
}

const MINI_TONE = {
  amber: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber',
  red: 'border-ops-red-line bg-ops-red-bg text-ops-red',
  blue: 'border-ops-blue-line bg-ops-card text-ops-blue',
} as const;

function MiniTile({ value, note, tone }: { value: string; note: string; tone?: keyof typeof MINI_TONE }) {
  return (
    <div className={['flex flex-col gap-px rounded-ops-card border px-3 py-2.5', tone ? MINI_TONE[tone] : 'border-ops-line bg-ops-card text-ops-ink'].join(' ')}>
      <span className="font-ops-mono text-ops-lead font-medium">{value}</span>
      <span className={['font-ops-body text-ops-micro', tone ? '' : 'text-ops-body'].join(' ')}>{note}</span>
    </div>
  );
}

/**
 * Kopyalanabilir alan — kod ve adres sistem DIŞINA elle taşınır (kâğıt tutanak, tedarikçi yazışması).
 * Kopyalama sessiz başarısız olmaz: pano yazılamazsa metin seçilebilir hâlde zaten duruyor.
 */
function CopyRow({ value, display, label, mono = false }: { value: string; display?: string[]; label: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-ops-btn border border-ops-line-strong bg-ops-line-soft px-2.5 py-2">
      <span className={['flex-1 text-ops-ink', mono ? 'font-ops-mono text-ops-lead font-semibold' : 'font-ops-body text-ops-sm leading-relaxed'].join(' ')}>
        {display ? display.map((line) => <span key={line} className="block">{line}</span>) : value}
      </span>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(value)}
        aria-label={`${label} kopyala`}
        className="flex flex-none cursor-pointer items-center gap-1 font-ops-display text-ops-micro font-medium text-ops-olive"
      >
        <CopyIcon size={12} />
        Kopyala
      </button>
    </div>
  );
}

/** Baş harfler — ad tek kelimeyse ilk iki harf (soyadı olmayan kayıt da vardır). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? `${parts[0]![0] ?? ''}${parts.at(-1)![0] ?? ''}` : name.slice(0, 2);
  return letters.toLocaleUpperCase('tr');
}
