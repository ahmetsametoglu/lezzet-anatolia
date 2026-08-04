'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { cardClass } from '@/components/operation/ui/card';
import { Button } from '@/components/operation/ui/button';
import { AlertIcon, InfoIcon, WarehouseIcon } from '@/components/operation/ui/icons';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { decimal, money, num, shortDateTime } from '@/components/operation/ui/format';
import type { Country } from '@lezzet/types';
import type { ZoneDemandRow } from '@/lib/delivery/zone-demand';
import { ordersLink } from '../orders/orders-url';
import { settingsLink } from '../settings/settings-url';
import { stockLink } from '../stock/stock-url';
import {
  addressOneLine,
  postalCodeLabel,
  statusLabel,
  statusTone,
  weekdayList,
} from './warehouses-labels';
import type { ScorecardView, StaffChipView, WarehouseRowView, ZoneCardView } from './warehouses-types';

// Depolar ekranının bölümleri — web ve mobil AYNI parçaları kullanır (yerleşim çatallanır, içerik
// değil). Bölümler burada durur ki "karne mobilde başka şey sayar" gibi bir ayrışma doğmasın.

/**
 * Kargo çıkışı olmayan ülke uyarısı — ekranın en üstünde, listeden ÖNCE.
 *
 * Sessiz bırakılamaz: o ülkede bölge dışı müşteriye satış yapılamaz ve sipariş **hiç açılmaz**
 * (deposu çözülemediği için). Operatör bunu ancak bir müşteri şikâyet edince fark ederdi.
 */
export function ShippingGapBanner({ countries }: { countries: readonly Country[] }) {
  if (countries.length === 0) return null;
  const names = countries.map((c) => COUNTRY_LABELS[c]).join(' · ');
  return (
    <div role="alert" className="flex items-start gap-2.5 border-b border-ops-red-line bg-ops-red-bg px-6 py-2.5">
      <span className="mt-px flex-none text-ops-red">
        <AlertIcon size={15} />
      </span>
      <span className="font-ops-body text-ops-sm leading-relaxed text-ops-red">
        <strong>{names} için kargo çıkış deposu yok</strong> — o ülkede bölge dışı müşteriye satış yapılamaz; sipariş
        deposu çözülemediği için hiç açılmaz. Ülke başına en fazla bir kargo deposu olabilir.
      </span>
    </div>
  );
}

/** Kurulum eksikliği / bilgi şeridi — satırın ve kartın paylaştığı sarı kutu. */
export function SetupGapNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-2.5 py-2">
      <span className="mt-px flex-none text-ops-amber">
        <InfoIcon size={14} />
      </span>
      <span className="font-ops-body text-ops-sm leading-snug text-ops-amber">{text}</span>
    </div>
  );
}

/** Liste satırı — künye üstte, sayılar çip olarak altta; kurulum eksikse gerekçesiyle. */
export function WarehouseListRow({
  row,
  index,
  handle,
  onOpen,
}: {
  row: WarehouseRowView;
  index: number;
  handle?: React.ReactNode;
  onOpen: () => void;
}) {
  const address = addressOneLine(row.address, row.countryCode);
  return (
    <article
      onClick={onOpen}
      className={[
        'flex cursor-pointer flex-col gap-2.5 rounded-ops-card border px-4 py-3 transition-colors',
        row.isActive ? 'border-ops-line bg-ops-card hover:border-ops-olive-line' : 'border-ops-line bg-ops-subtle opacity-70',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {handle ?? <span className="font-ops-mono text-ops-xs text-ops-faint">{index + 1}</span>}
        <span className="flex-none rounded-ops-btn border border-ops-line-strong bg-ops-line-soft px-2 py-0.5 font-ops-mono text-ops-sm font-semibold text-ops-ink">
          {row.code}
        </span>
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{row.name}</span>
        <span className="font-ops-body text-ops-sm text-ops-muted">{COUNTRY_LABELS[row.countryCode]}</span>
        <span className="flex-1" />
        {row.shipsOnline ? (
          <Badge tone="blue" outline>
            Kargo çıkışı
          </Badge>
        ) : null}
        <Badge tone={statusTone(row)}>{statusLabel(row)}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {address ? <span className="mr-auto font-ops-body text-ops-sm text-ops-body">{address}</span> : null}
        <RowStats row={row} />
      </div>

      {row.setupGap ? <SetupGapNote text={row.setupGap} /> : null}
    </article>
  );
}

/**
 * Satırın özet sayıları. Hepsi aynı soruya hizmet eder: **bu tesis işe yarıyor mu.** Sıfır olan
 * sayı gizlenmez, KIRMIZI yazılır — "bölge yok" bir eksiklik hâlidir, boşluk değil.
 */
function RowStats({ row }: { row: WarehouseRowView }) {
  const stats: Array<{ label: string; tone?: 'amber' | 'red' | 'blue' }> = [];

  stats.push(
    row.activeZoneCount === 0
      ? { label: 'bölge yok', tone: 'red' }
      : { label: `${row.activeZoneCount} bölge · ${row.postalCodeCount} posta kodu` },
  );
  stats.push(row.staffCount === 0 ? { label: 'personel yok', tone: 'red' } : { label: `${row.staffCount} personel` });
  stats.push(
    row.batchCount === 0
      ? { label: 'stok yok' }
      : { label: `${row.variantCount} varyant · ${row.batchCount} parti` },
  );
  if (row.attentionCount > 0) stats.push({ label: `${row.attentionCount} yaklaşan tarihli`, tone: 'amber' });
  if (row.inTransitIn + row.inTransitOut > 0) {
    stats.push({ label: `${row.inTransitIn + row.inTransitOut} sevkiyat yolda`, tone: 'blue' });
  }

  return (
    <>
      {stats.map((s) => (
        <Badge key={s.label} tone={s.tone ?? 'neutral'} outline>
          {s.label}
        </Badge>
      ))}
    </>
  );
}

/** Tesis rayı — kart görünümündeki sol şerit. Bağlam bu listeyi DARALTMAZ. */
export function FacilityRail({
  rows,
  activeCode,
  onSelect,
}: {
  rows: readonly WarehouseRowView[];
  activeCode: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="flex w-[186px] flex-none flex-col border-r border-ops-line bg-ops-subtle">
      <div className="flex flex-col gap-px border-b border-ops-line px-3.5 py-3">
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">Tesisler</span>
        <span className="font-ops-body text-ops-xs text-ops-muted">operatör sırası</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {rows.map((row) => {
          const on = row.code === activeCode;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelect(row.code)}
              aria-current={on ? 'true' : undefined}
              className={[
                'flex cursor-pointer flex-col gap-0.5 rounded-ops-btn border px-2.5 py-2 text-left transition-colors',
                on ? 'border-l-[3px] border-ops-olive bg-ops-card' : 'border-ops-line bg-ops-card hover:border-ops-olive-line',
                row.isActive ? '' : 'opacity-70',
              ].join(' ')}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="font-ops-mono text-ops-sm font-semibold text-ops-ink">{row.code}</span>
                <span className="min-w-0 flex-1 truncate font-ops-display text-ops-sm font-semibold text-ops-ink">
                  {row.name}
                </span>
              </span>
              <span className={['font-ops-body text-ops-xs', row.setupGap || !row.isActive ? 'text-ops-amber' : 'text-ops-muted'].join(' ')}>
                {railNote(row)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-ops-line px-3.5 py-2.5 font-ops-body text-ops-micro leading-relaxed text-ops-muted">
        Bağlam bu listeyi daraltmaz — depolar yönetim nesnesidir.
      </div>
    </div>
  );
}

/** Raydaki alt satır: tesisin durumu tek cümlede. Sıralama ağırlığa göre — en kötü hâl kazanır. */
function railNote(row: WarehouseRowView): string {
  if (!row.isActive) return 'kapalı';
  if (row.setupGap) return 'kurulumu eksik';
  return row.shipsOnline ? `${COUNTRY_LABELS[row.countryCode]} · kargo çıkışı` : COUNTRY_LABELS[row.countryCode];
}

/** Bölüm başlığı — başlık + neden orada olduğunu söyleyen tek satır. */
export function SectionHead({ title, hint, aside }: { title: string; hint: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5">
      <span className="font-ops-display text-ops-section font-semibold text-ops-ink">{title}</span>
      <span className="font-ops-body text-ops-sm text-ops-muted">{hint}</span>
      {aside ? (
        <>
          <span className="flex-1" />
          {aside}
        </>
      ) : null}
    </div>
  );
}

/** Künye kutusu — etiket + değer + alt not. */
export function FactCard({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'amber' }) {
  return (
    <div className={cardClass('flex flex-col gap-0.5 px-3.5 py-2.5')}>
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-wide text-ops-muted">{label}</span>
      <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{value}</span>
      {note ? (
        <span className={['font-ops-body text-ops-micro', tone === 'amber' ? 'text-ops-amber' : 'text-ops-muted'].join(' ')}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

/** Bölge kartı — ad + günler + kodlar. Kodlar bölgenin gerçeği, gün ise onu taşıyan katman. */
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

      <Button variant="secondary" size="sm" onClick={onEdit} className="self-start">
        Düzenle
      </Button>
    </div>
  );
}

/**
 * Karne — **SAYAR, LİSTELEMEZ.** Her sayı Stok'a bu depo bağlamıyla giden bir kapıdır; parti listesi
 * orada yaşar, burada tekrarlanmaz (iki sahipli bir liste, bir gün ayrışan iki liste demektir).
 */
export function Scorecard({ card, code }: { card: ScorecardView; code: string }) {
  // Adresler hedef ekranın kendi sözleşmesinden kurulur (`stockLink` · `ordersLink`): parametre
  // adlarını burada elle yazmak, o ekranlar değiştiğinde sessizce yanlış yere giden bağlantı demekti.
  const stockHref = stockLink({ depo: code });
  return (
    <div className="flex flex-col gap-2.5">
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
        <ScoreTile
          tone="red"
          label="Eşik altı"
          value={num(card.belowMinCount)}
          note="varyant — eşik depo bazlıdır"
          href="/operations/procurement"
        />
        <ScoreTile
          tone="blue"
          label="Yolda bekleyen"
          value={`${num(card.inTransitIn)} / ${num(card.inTransitOut)}`}
          note="gelen / giden · yoldaki mal hiçbir depoda satılamaz"
        />
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        <ScoreTile label="Açık iş" value={num(card.openOrderCount)} note="buradan çıkacak, teslim edilmemiş sipariş" href={ordersLink({ depo: code })} />
        <div className="col-span-3 flex flex-wrap items-center gap-3 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
          <span className="min-w-[220px] flex-1 font-ops-body text-ops-sm leading-relaxed text-ops-body">
            Eşik altının iki yolu vardır ve ekran ikisini de açar: <strong>tedarik siparişi</strong> ya da{' '}
            <strong>başka depodan transfer</strong>. Sayıya dokunmak listeyi burada açmaz — Stok'a, bağlamı{' '}
            {code}'ye alınmış hâlde gider.
          </span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Son mal girişi: {card.lastIntakeAt ? shortDateTime(card.lastIntakeAt) : 'hiç giriş yok'}
          </span>
        </div>
      </div>
    </div>
  );
}

const TILE_TONE = {
  amber: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber',
  red: 'border-ops-red-line bg-ops-red-bg text-ops-red',
  blue: 'border-ops-blue-line bg-ops-card text-ops-blue',
} as const;

/**
 * Karne kutusu. `href` verilen kutu bir KAPIDIR ve tıklanır; verilmeyen yalnız bir ölçüdür.
 * "Yolda bekleyen" bilerek kapısız: yoldaki mal hiçbir deponun stoğunda değildir, yani Stok'ta
 * gösterilecek bir satırı da yoktur — tıklanabilir yapmak boş bir listeye götürürdü.
 */
function ScoreTile({
  label,
  value,
  note,
  aside,
  tone,
  href,
}: {
  label: string;
  value: string;
  note: string;
  aside?: string;
  tone?: keyof typeof TILE_TONE;
  href?: string;
}) {
  const toneCls = tone ? TILE_TONE[tone] : 'border-ops-line bg-ops-card text-ops-ink';
  const body = (
    <>
      <span className={['font-ops-display text-ops-micro font-medium uppercase tracking-wide', tone ? '' : 'text-ops-muted'].join(' ')}>
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-ops-mono text-ops-title font-medium">{value}</span>
        {aside ? <span className="font-ops-mono text-ops-sm">{aside}</span> : null}
      </span>
      <span className={['font-ops-body text-ops-xs', tone ? '' : 'text-ops-body'].join(' ')}>{note}</span>
    </>
  );
  const cls = ['flex flex-col gap-0.5 rounded-ops-card border px-3.5 py-3', toneCls].join(' ');
  return href ? (
    <Link href={href} className={`${cls} cursor-pointer transition-colors hover:border-ops-olive`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Bağlı personel — **okunur.** Amaç yönetim değil SONUÇ: tek kapsamı burası olan biri varsa kapatma
 * onu kapalı kapı hâline düşürür. Kapsam ataması Ayarlar'daki kişi kartındadır; kişi tek yerden
 * yönetilir, iki ekrandan değil.
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
      {/* Kapsam Ayarlar'ın PERSONEL sekmesinde yönetilir — bağlantı doğrudan oraya, ekranın köküne
          değil: operatörün sorusu "bu kişinin kapsamını nereden değiştiririm" ve cevabı bir sekme
          uzakta bırakmak, bildiğimiz bir yolu yarım tarif etmek olurdu. */}
      <Link
        href={settingsLink({ tab: 'staff' })}
        className="cursor-pointer self-center font-ops-body text-ops-xs text-ops-olive underline-offset-2 hover:underline"
      >
        Kapsam Ayarlar'da yönetilir →
      </Link>
    </div>
  );
}

/**
 * Gün hapı — bölgenin teslim günü (`Sa` · `Pe` · `Ct`).
 *
 * **`Badge` DEĞİL ve bu bilinçli** (denetim OP2): `Badge` bir *tint* ailesidir (zemin tonun açık
 * hâli, metin koyu hâli) ve anlamı DURUM'dur. Gün hapı bir durum değil **küme üyeliği** — dolu
 * zemin "bu gün seçili" demektir. `Badge`'e "dolu" varyantı eklemek, rozetin tint sözleşmesini iki
 * anlama bölerdi.
 *
 * Tasarım da böyle çiziyor (`Operasyon - Depolar.dc.html`: tam yuvarlak, dolu olive). Adlandırılmış
 * olmasının sebebi ayrı: satır içi bir hap, gün listesi çizen bir sonraki ekranda dördüncü biçimi
 * doğurur.
 *
 * **Terfi eşiği:** Teslimat ekranı (11.x) aynı şeridi çizecek — ikinci tüketici doğduğu gün bu
 * komponent `components/operation/ui/`'ye taşınır (`CLAUDE.md §2` yerleşim kuralı). Bugün tek
 * tüketicisi var, sayfa altında durması doğru.
 */
function DayPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-ops-olive px-2 py-0.5 font-ops-display text-ops-micro font-semibold text-ops-card">
      {label}
    </span>
  );
}

/**
 * Personel çipi — kim bu tesiste çalışıyor. Nötr, çerçeveli, tıklanmaz.
 *
 * `Badge`'den ayrı çünkü bir durum değil bir KAYIT gösteriyor (kişi), ve `Chip`'ten ayrı çünkü
 * `Chip` bir süzgeç kontrolüdür — tıklanır ve seçili hâli vardır. Bu ikisinin de olmadığı üçüncü
 * bir şey: okunur künye.
 */
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

/**
 * **Bölge dışı talep — hangi kodlar bizi arıyor** (kullanıcı kararı 04.08, `ANALYTICS §6`;
 * çizim `Operasyon - Analitik.dc.html` alt bölümü, karar onu bu ekrana taşıdı).
 *
 * Harita "nereyi açabilirim"i gösterir, bu tablo **"nereyi açmalıyım"ı**. Bölge kurulumunun eksik
 * girdisi buydu: hizmet vermediğimiz kodlardan gelen talep zaten sayılıyordu (`postal_code_demand`)
 * ve hiçbir ekranda görünmüyordu.
 *
 * ── İKİ SAYI, İKİ SÜTUN, TOPLANMAZ ──────────────────────────────────────────
 * `Talep` anonim bir sayaçtır (aynı ziyaretçinin tekrarı ayrı sayılır), `Haber bekleyen` ise
 * izin vermiş, kimlikli kişidir. Aynı olgunun iki ayrı defteri (`ANALYTICS §2`'nin kendi emsali:
 * `postal_code_demand` ↔ `zone_notice`). Tek bir "ilgi" sayısına indirmek, anonim sayacı geriye
 * dönük kimliklendirmek olurdu — o yüzden ekran ikisini asla toplamıyor.
 *
 * **Kapsananlar listeden ATILMAZ, işaretlenir:** "buraya zaten gidiyoruz ama talep yoğun" da bir
 * bilgi (teslim günü sıklığı sorusunu doğurur). Sıralamayı kapı yapıyor, kapsanmayanlar önde.
 */
export function ZoneDemandTable({ rows }: { rows: readonly ZoneDemandRow[] }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
      <SectionHead
        title="Posta kodu talebi"
        hint="hangi kod ne sıklıkla soruluyor ve karşılığında ne sipariş çıkıyor — bölgeyi nereye genişleteceğimizin ve nerede sorun olduğunun verisi"
      />
      {rows.length === 0 ? (
        // Boş hâl bir SONUÇTUR, gizlenmez: "kimse sormadı" da bölge açma kararının cevabı olabilir.
        <p className={cardClass('px-3.5 py-3 font-ops-body text-ops-sm leading-relaxed text-ops-muted')}>
          Henüz bölge dışından bir posta kodu girilmemiş. Bir ziyaretçi hizmet alanımız dışında bir kod girdiğinde burada
          birikmeye başlar.
        </p>
      ) : (
        <div className="overflow-hidden rounded-ops-card border border-ops-line">
          <div className="grid grid-cols-[1fr_84px_104px_84px_92px] gap-x-3 border-b border-ops-line bg-ops-subtle px-4 py-2 font-ops-display text-ops-micro font-semibold uppercase tracking-wide text-ops-muted">
            <span>Posta kodu</span>
            <span className="text-right">Talep</span>
            <span className="text-right">Haber bekleyen</span>
            <span className="text-right">Sipariş</span>
            <span className="text-right">Sip./talep</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.postalCode}
              className="grid grid-cols-[1fr_84px_104px_84px_92px] items-center gap-x-3 border-b border-ops-line-soft px-4 py-2 last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-ops-mono text-ops-sm font-medium text-ops-ink">{row.postalCode}</span>
                {/* Kapsanan satır NÖTR rozetle kalır: bir iş değil, bir bağlam. */}
                {row.covered ? <Badge tone="neutral">rotada</Badge> : null}
                <span className="font-ops-mono text-ops-micro text-ops-faint">{shortDateTime(row.lastSeenAt)}</span>
              </span>
              <span className="text-right font-ops-mono text-ops-sm text-ops-ink">{num(row.requestCount)}</span>
              {/* Sıfır bekleyen `—` değil `0`: burada sıfır ölçülmüş bir sonuçtur, eksik ölçüm değil. */}
              <span className={`text-right font-ops-mono text-ops-sm ${row.waitingCount > 0 ? 'text-ops-olive-dark' : 'text-ops-muted'}`}>
                {num(row.waitingCount)}
              </span>
              {/* Kapsam DIŞI kodda sipariş zaten olamaz — sıfır bir eksiklik değil, tanımın kendisi;
                  o yüzden soluk. Asıl okunacak satırlar "rotada" olup da siparişi düşük olanlar. */}
              <span className={`text-right font-ops-mono text-ops-sm ${row.covered ? 'text-ops-ink' : 'text-ops-faint'}`}>
                {num(row.orderCount)}
              </span>
              <span className="text-right font-ops-mono text-ops-micro text-ops-muted">
                {row.orderRatio === null ? '—' : decimal(row.orderRatio, 2)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="px-0.5 font-ops-body text-ops-xs leading-relaxed text-ops-muted">
        <strong>Talep</strong> ile <strong>Haber bekleyen</strong> toplanmaz: biri anonim bir sayaçtır (kim olduğu
        tutulmaz), öteki izin vermiş kişidir. <strong>Sip./talep bir dönüşüm yüzdesi DEĞİL</strong>, bir sıralama
        sinyalidir — payda aynı ziyaretçinin tekrar sormasını da sayıyor, yani gerçek dönüşümden küçüktür ve kodlar
        arasında karşılaştırmak için anlamlıdır. Sipariş ve talep <strong>tüm zamana</strong> aittir; dönem süzgeci yok,
        çünkü biri süzülüp öteki süzülmese oran pencere daraldıkça sessizce düşer ve düşüş bir sinyal sanılırdı.{' '}
        Bir kodu bölgeye ekleyip kaydettiğinizde o koddaki bekleyenlere haber gider — BEKLEYEN(19.21): gönderim işi
        henüz bağlı değil.
      </p>
    </section>
  );
}
