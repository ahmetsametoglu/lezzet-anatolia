'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { cardClass } from '@/components/operation/ui/card';
import { Button } from '@/components/operation/ui/button';
import { TrashIcon, WarehouseIcon } from '@/components/operation/ui/icons';
import { ScoreTile } from '@/components/operation/ui/score-tile';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { Toggle } from '@/components/operation/form/toggle';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { money, num, shortDate, shortDateTime } from '@/components/operation/ui/format';
import type { Country, ShippingBox } from '@lezzet/types';
import { ordersLink } from '../orders/orders-url';
import { settingsLink } from '../settings/settings-url';
import { stockLink } from '../stock/stock-url';
import { LABEL_SIZE_OPTIONS, postalCodeLabel, weekdayList } from './warehouses-labels';
import type {
  ScorecardView,
  ShippingBoxesView,
  StaffChipView,
  VanLoadCardView,
  WarehouseRowView,
  ZoneCardView,
} from './warehouses-types';

// Depolar ekranının durumsuz bölümleri; her bölüm tek yerde çizilir ki iki yerde ayrı sayı saymasın.

/**
 * Tesis bandı: tesisler hep görünür, seçilenin detayı altta. Sıra sürüklenerek değişir ve bütün depo seçicilerinde geçerlidir;
 * 5 px hareket eşiği sürüklemeyi tıklamadan ayırır.
 */
export function FacilityStrip({
  rows,
  activeCode,
  onSelect,
  onReorder,
}: {
  rows: readonly WarehouseRowView[];
  activeCode: string;
  onSelect: (code: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-none flex-col gap-2 border-b border-ops-line bg-ops-subtle px-6 py-3">
      <div className="flex items-baseline gap-2">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">Tesisler</span>
        <span className="font-ops-body text-ops-micro text-ops-faint">
          sürükleyerek sırala — sıra tüm depo seçicilerinde aynıdır
        </span>
        <span className="ml-auto font-ops-body text-ops-micro text-ops-faint">bağlam bu listeyi daraltmaz</span>
      </div>

      {/* `SortableList` DOM kabı çizmez (dnd sağlayıcıları eleman üretmez) — satırlar doğrudan bu
          kaba düşer, o yüzden yatay akış ve aralık BURADA tanımlı. */}
      <div className="flex flex-wrap gap-2">
        <SortableList
          items={[...rows]}
          getId={(row) => row.id}
          layout="grid"
          grab="item"
          onReorder={onReorder}
          renderItem={(row) => <FacilityChip row={row} active={row.code === activeCode} onSelect={() => onSelect(row.code)} />}
        />
      </div>
    </div>
  );
}

/** Tesis çipi; seçili olan rozetle değil sol kenarıyla işaretlenir. */
function FacilityChip({ row, active, onSelect }: { row: WarehouseRowView; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={[
        'flex min-w-[168px] cursor-pointer flex-col gap-0.5 rounded-ops-btn border px-2.5 py-2 text-left transition-colors',
        active
          ? 'border-l-[3px] border-ops-olive bg-ops-card shadow-sm'
          : 'border-ops-line bg-ops-card hover:border-ops-olive-line',
        row.isActive ? '' : 'opacity-70',
      ].join(' ')}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="font-ops-mono text-ops-sm font-semibold text-ops-ink">{row.code}</span>
        <span className="min-w-0 flex-1 truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{row.name}</span>
      </span>
      <span className={['font-ops-body text-ops-xs', row.setupGap || !row.isActive ? 'text-ops-amber' : 'text-ops-muted'].join(' ')}>
        {railNote(row)}
      </span>
    </button>
  );
}

/** Çipin alt satırı: tesisin durumu tek cümlede, en kötü hâl kazanır. */
function railNote(row: WarehouseRowView): string {
  if (!row.isActive) return 'kapalı';
  if (row.setupGap) return 'kurulumu eksik';
  // Roller ülkenin yanına dizilir: kargo çıkışı ve gel-al noktası aynı tesiste olabilir.
  return [COUNTRY_LABELS[row.countryCode], row.shipsOnline ? 'kargo çıkışı' : null, row.pickupEnabled ? 'gel-al' : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Bölge kartı: üstte tanım (ad, gün, kodlar), altta sonuç (sipariş, ciro, bekleyen), çünkü bölgeye dokunma kararı ne getirdiğine
 * bağlı. Sayılar Rotalar ekranıyla aynı kaynaktan gelir ki iki ekran aynı soruya iki sayı vermesin.
 */
export function ZoneCard({
  zone,
  homeCountry,
  onEdit,
}: {
  zone: ZoneCardView;
  homeCountry: Country;
  onEdit: () => void;
}) {
  const days = weekdayList(zone.weekdays);
  return (
    <div className={cardClass('flex flex-col gap-2 px-3.5 py-3')}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{zone.name}</span>
        <Badge tone={zone.isActive ? 'olive' : 'neutral'}>{zone.isActive ? 'Aktif' : 'Pasif'}</Badge>
      </div>

      {/* Gün YOKSA "her gün" değil "belirlenmedi": boş bir gün kümesi, teslimatı olmayan bir bölgedir. */}
      {days.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {days.map((d) => (
            <DayPill key={d} label={d} />
          ))}
        </div>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-amber">Teslim günü belirlenmedi</span>
      )}

      {zone.postalCodes.length > 0 ? (
        <>
          <span className="font-ops-mono text-ops-sm leading-relaxed text-ops-body">
            {zone.postalCodes.map((c) => postalCodeLabel(c, homeCountry)).join(' · ')}
          </span>
          <span className="font-ops-body text-ops-micro text-ops-muted">{zone.postalCodes.length} posta kodu</span>
        </>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-amber">Kod bağlanmadı — bu bölgeye hiçbir adres düşmez</span>
      )}

      {/* ── Ağırlık ── ayraçla ayrı: üstü TANIM, altı SONUÇ. İkisi aralıksız yazılsaydı sipariş
          sayısı bölgenin bir ayarı gibi okunurdu. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-ops-line-soft pt-2">
        {/* Sipariş sıfırsa da YAZILIR: burada sıfır ölçülmüş bir sonuçtur (kod var, sipariş yok) ve
            tam da o satır "bu bölge neden duruyor" sorusunu doğurur. */}
        <span className="font-ops-body text-ops-xs text-ops-muted">
          <strong className="font-ops-mono text-ops-sm font-medium text-ops-strong">{num(zone.orderCount)}</strong> sipariş
        </span>
        {zone.revenueCents > 0 ? (
          <span className="font-ops-mono text-ops-xs text-ops-body">{money(zone.revenueCents)}</span>
        ) : null}
        {/* Bekleyen SIFIRSA çizilmez: her karta "0 bekliyor" yazmak, gerçekten bekleyeni olan bölgeyi
            gürültünün içinde kaybederdi (Rotalar'daki ağırlık rayının aynı kuralı). */}
        {zone.waitingCount > 0 ? <Badge tone="blue">{num(zone.waitingCount)} bekliyor</Badge> : null}
        {zone.nextDeliveryDate ? (
          <span className="ml-auto font-ops-body text-ops-xs text-ops-muted">
            sıradaki çıkış <strong className="font-semibold text-ops-strong">{shortDate(zone.nextDeliveryDate)}</strong>
          </span>
        ) : null}
      </div>

      <Button variant="secondary" size="sm" onClick={onEdit} className="self-start">
        Düzenle
      </Button>
    </div>
  );
}

/**
 * Karne sayar, listelemez: her sayı Stok'a bu depo bağlamıyla giden bir kapıdır. Parti listesi orada yaşar ki iki sahipli bir
 * liste doğmasın.
 */
export function Scorecard({ card, code }: { card: ScorecardView; code: string }) {
  // Adresler hedef ekranın kendi sözleşmesinden kurulur (`stockLink` · `ordersLink`): parametre
  // adlarını burada elle yazmak, o ekranlar değiştiğinde sessizce yanlış yere giden bağlantı demekti.
  const stockHref = stockLink({ depo: code });
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2.5">
        <ScoreTile label="Elde ne var" value={num(card.variantCount)} note={`varyantta stok · ${num(card.batchCount)} parti`} href={stockHref} />
        <ScoreTile
          tone="amber"
          label="Risk"
          value={num(card.nearExpiryCount)}
          // Tutar ÖLÇÜLEMEDİYSE yazılmaz: alış fiyatı girilmemiş partiden risk tutarı çıkmaz ve
          // "0 €" yazmak bozuk ölçümü sağlıklı gibi okuturdu (`CLAUDE.md §1`).
          aside={card.riskCents === null ? 'tutar bilinmiyor' : money(card.riskCents)}
          note={`yaklaşan tarihli parti${card.expiredCount > 0 ? ` · ${card.expiredCount} süresi geçmiş (yalnız imha yolu)` : ''}`}
          href={stockLink({ depo: code, tab: 'attention', scope: 'expiry' })}
        />
        <ScoreTile tone="red" label="Eşik altı" value={num(card.belowMinCount)} note="varyant" href="/operations/procurement" />
        <ScoreTile
          label="Açık iş"
          value={num(card.openOrderCount)}
          note="buradan çıkacak, teslim edilmemiş sipariş"
          href={ordersLink({ depo: code })}
        />
      </div>
      <span className="px-0.5 font-ops-body text-ops-xs text-ops-muted">
        Son mal girişi: {card.lastIntakeAt ? shortDateTime(card.lastIntakeAt) : 'hiç giriş yok'}
      </span>
    </div>
  );
}

/**
 * Karnenin dipnotu: araç ayrı bir depo olduğu için karnede sayılmaz, burada eklenir. Kutu (satılmış, müşterinin malı) ile adet
 * (araçta, kapıda satılabilir) ayrı yazılır ki karışmasın.
 */
export function VanLoadRow({ load }: { load: VanLoadCardView }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-0.5">
      <span className="font-ops-body text-ops-xs uppercase tracking-wide text-ops-muted">Araçta ek olarak</span>
      {load.boxes && <span className="font-ops-body text-ops-sm text-ops-ink">{load.boxes}</span>}
      {load.vans.map((van) => (
        <Link
          key={van.code}
          href={van.href}
          className="cursor-pointer font-ops-body text-ops-sm text-ops-ink underline-offset-2 hover:text-ops-accent hover:underline"
          title={van.name}
        >
          {van.code} · {van.summary}
        </Link>
      ))}
      {/* Araç kaydı bağlanmamışsa kutu yine sayılır ama malın nerede olduğu söylenemez — sessiz
          kalmak yerine sebebi yazılıyor (kurulum eksikliği bir arıza değil, bir eksik). */}
      {load.vans.length === 0 && (
        <span className="font-ops-body text-ops-xs text-ops-faint">bu tesise bağlı araç tanımlı değil</span>
      )}
    </div>
  );
}

/**
 * Bağlı personel salt okunur: tek kapsamı burası olan kişi, depo kapanırsa kapısız kalacağı için işaretlenir. Kapsam ataması
 * Ayarlar'daki kişi kartında, tek yerden yapılır.
 */
export function StaffChips({ staff }: { staff: readonly StaffChipView[] }) {
  if (staff.length === 0) {
    return (
      <span className="font-ops-body text-ops-sm text-ops-amber">
        Kapsamında bu depo olan kimse yok — mal kabul ve hazırlık yapılamaz.
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {staff.map((p) => (
        <StaffChip key={p.id} name={p.name} role={p.roleText} note={p.onlyHere ? 'tek kapsamı burası' : null} />
      ))}
      {/* Bağlantı ekranın köküne değil personelin durduğu sekmeye gider; soru "kapsamı nereden değiştiririm". */}
      <Link
        href={settingsLink({ tab: 'setup' })}
        className="cursor-pointer self-center font-ops-body text-ops-xs text-ops-olive underline-offset-2 hover:underline"
      >
        Kapsam Ayarlar'da yönetilir →
      </Link>
    </div>
  );
}

/**
 * Etiket yazıcıları: kutu kapanışında ve sevkte etiket basan cihazlar. Tanımsızlık arıza değil ama amber'le söylenir, çünkü kutu
 * akışı kurulmuş bir depoda yazıcısızlık büyük olasılıkla unutulmuş kurulumdur.
 */
export function PrinterCard({
  printers,
  onEdit,
}: {
  printers: Array<{ id: string; name: string; purpose: 'box' | 'shipping'; address: string; model: string; labelSize: string }>;
  onEdit: () => void;
}) {
  // İki amaç ayrı sayılır, çünkü etiketler fiziksel olarak farklıdır (kargo A6 yatay, kutu 4×6). Kargo yazıcısının eksikliği aksi
  // hâlde ancak sevk anında, kutu kapandıktan sonra görünürdü.
  const kutu = printers.filter((p) => p.purpose === 'box');
  const kargo = printers.filter((p) => p.purpose === 'shipping');
  const sizeOf = (v: string) => LABEL_SIZE_OPTIONS.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="flex flex-col gap-2">
      {printers.length === 0 ? (
        <span className="font-ops-body text-ops-sm text-ops-amber">
          Yazıcı tanımlı değil — telefon basmayı hiç denemez, etiket kartı yalnız önizleme gösterir.
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {printers.map((row) => (
            <span
              key={row.id}
              className="flex items-center gap-1.5 rounded-full border border-ops-line bg-ops-card px-3 py-1.5 font-ops-body text-ops-sm text-ops-strong"
            >
              {row.name}
              <span className="font-ops-body text-ops-xs text-ops-muted">
                · {row.purpose === 'shipping' ? 'kargo' : 'kutu'}
              </span>
              <span className="font-ops-mono text-ops-xs text-ops-muted">{row.address}</span>
              <span className="font-ops-body text-ops-xs text-ops-muted">· {sizeOf(row.labelSize)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Eksik AMAÇ ayrı ayrı söyleniyor: "yazıcı var" cümlesi hangi işin karşılıksız olduğunu gizler. */}
      {printers.length > 0 && kutu.length === 0 ? (
        <span className="font-ops-body text-ops-xs text-ops-amber">Kutu etiketi yazıcısı yok — kapanışta etiket basılmaz.</span>
      ) : null}
      {printers.length > 0 && kargo.length === 0 ? (
        <span className="font-ops-body text-ops-xs text-ops-amber">
          Kargo etiketi yazıcısı yok — bu depodan taşıyıcı etiketi basılamaz.
        </span>
      ) : null}

      <div>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          {printers.length > 0 ? 'Yazıcıları düzenle' : 'Yazıcı tanımla'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Kargo kutuları: deponun taşıyıcıya verdiği dış kutular. Sistem şablonları ayrı sırada durur, çünkü deponun kutusu değil
 * benimsenmeyi bekleyen adaylardır; benimsenen şablon o sıradan düşer.
 */
export function ShippingBoxCard({
  view,
  onAdd,
  onEdit,
  onAdopt,
  onToggle,
  onDelete,
}: {
  view: ShippingBoxesView;
  onAdd: () => void;
  onEdit: (box: ShippingBox) => void;
  onAdopt: (templateId: string) => void;
  onToggle: (box: ShippingBox) => void;
  onDelete: (box: ShippingBox) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {view.boxes.length === 0 ? (
        <span className="font-ops-body text-ops-sm text-ops-amber">
          Kutu tanımlı değil — bu depodan kargo etiketi alınamaz. Aşağıdan bir sistem kutusu ekleyin ya da kendi
          kutunuzu tanımlayın.
        </span>
      ) : (
        <div className="overflow-hidden rounded-ops-card border border-ops-line">
          {view.boxes.map((box) => (
            <div
              key={box.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ops-line-soft bg-ops-white px-[13px] py-2 last:border-b-0"
            >
              <span className={`font-ops-body text-ops-sm font-semibold ${box.isActive ? 'text-ops-strong' : 'text-ops-faint line-through'}`}>
                {box.name}
              </span>
              <span className="font-ops-mono text-ops-xs text-ops-muted">
                {box.lengthMm}×{box.widthMm}×{box.heightMm} mm
              </span>
              <span className="font-ops-body text-ops-xs text-ops-muted">dara {box.tareG} g</span>
              {/* Azami içerik boşsa satır HİÇ çizilmez: "sınır yok" ile "sınır bilinmiyor" ayrı
                  şeyler ve ikincisini birincisi gibi yazmak, kutuya fazla yük koydururdu. */}
              {box.maxContentG !== null && (
                <span className="font-ops-body text-ops-xs text-ops-muted">azami {box.maxContentG} g</span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <Toggle on={box.isActive} size="sm" onChange={() => onToggle(box)} />
                <button
                  type="button"
                  onClick={() => onEdit(box)}
                  className="cursor-pointer font-ops-display text-ops-micro font-semibold uppercase tracking-[0.05em] text-ops-olive hover:text-ops-olive-dark"
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(box)}
                  className="cursor-pointer text-ops-faint hover:text-ops-red"
                  aria-label={`${box.name} kutusunu sil`}
                  title="Hiç kullanılmamış kutu silinebilir; kullanılmışsa yalnız kapatılır"
                >
                  <TrashIcon />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onAdd}>
          Yeni kutu
        </Button>
        {view.adoptable.length > 0 && (
          <>
            <span className="ml-1 font-ops-body text-ops-xs text-ops-muted">sistem kutularından ekle:</span>
            {view.adoptable.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onAdopt(tpl.id)}
                className="cursor-pointer rounded-full border border-dashed border-ops-line px-2.5 py-1 font-ops-body text-ops-xs text-ops-body hover:border-ops-olive hover:text-ops-olive"
                title={`${tpl.lengthMm}×${tpl.widthMm}×${tpl.heightMm} mm · dara ${tpl.tareG} g — kopyalanır, sonra kendi ölçünüze göre düzeltebilirsiniz`}
              >
                + {tpl.name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Gün hapı: dolu zemin bir durum değil küme üyeliği ("bu gün seçili") demektir, bu yüzden `Badge`in tint sözleşmesine girmez. İkinci
 * tüketici doğduğunda `components/operation/ui/`ye taşınır.
 */
function DayPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-ops-olive px-2 py-0.5 font-ops-display text-ops-micro font-semibold text-ops-card">
      {label}
    </span>
  );
}

/** Personel çipi: durum değil kayıt gösterir ve tıklanmaz, bu yüzden ne `Badge` ne `Chip`. */
function StaffChip({ name, role, note }: { name: string; role: string; note: string | null }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-ops-line bg-ops-card px-3 py-1.5 font-ops-body text-ops-sm text-ops-strong">
      <span className="text-ops-faint">
        <WarehouseIcon size={12} />
      </span>
      {name} · {role}
      {note ? <span className="font-ops-body text-ops-xs text-ops-muted">{note}</span> : null}
    </span>
  );
}
