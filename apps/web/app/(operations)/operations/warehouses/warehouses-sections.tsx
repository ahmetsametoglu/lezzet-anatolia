'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { cardClass } from '@/components/operation/ui/card';
import { Button } from '@/components/operation/ui/button';
import { InfoIcon, WarehouseIcon } from '@/components/operation/ui/icons';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { money, num, shortDate, shortDateTime } from '@/components/operation/ui/format';
import type { Country } from '@lezzet/types';
import { ordersLink } from '../orders/orders-url';
import { settingsLink } from '../settings/settings-url';
import { stockLink } from '../stock/stock-url';
import { AREA_KIND_SHORT, postalCodeLabel, weekdayList } from './warehouses-labels';
import type { MeasurePointView, ScorecardView, StaffChipView, WarehouseRowView, ZoneCardView } from './warehouses-types';

// Depolar ekranının bölümleri — liste ve kart görünümü AYNI parçaları kullanır. Bölümler burada
// durur ki "karne başka yerde başka şey sayar" gibi bir ayrışma doğmasın.

// ── `ShippingGapBanner` KALKTI (17.08) ────────────────────────────────────────────────────────
// "Şu ülkede kargo çıkış deposu yok" uyarısıydı ve tek ülkeli bir kurulumda hiç tetiklenmiyordu.
// İkinci ülke açıldığı gün bu bir KURULUM kararıdır: künye penceresi kargo çıkışını zaten soruyor
// ve ülke başına tekliği veritabanı kısıtı reddediyor (`warehouse_single_online`). Uyarı bir
// eksikliği söylüyordu ama eksikliğin doğduğu yerde değil, ondan uzakta duruyordu.

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

// `WarehouseListRow` SİLİNDİ (16.08) — tek görünüme geçerken liste görünümü kalktı ve satırın
// çizecek yeri kalmadı. Taşıdığı bilgiler kayıp değil: künye (kod · ad · ülke · rozetler) başlık
// barına, sayılar Karne bölümüne, kurulum uyarısı detayın en üstündeki `SetupGapNote`a düştü.
// `RowStats` de onunla gitti — tek tüketicisi oydu.

/**
 * **Tesis şeridi** — başlığın hemen altında, yatay (kullanıcı kararı 16.08).
 *
 * ── NEDEN SOL RAY DEĞİL ARTIK ────────────────────────────────────────────────
 * Ekran 16.08'e kadar İKİ görünümdü: seçim yokken tesis listesi, seçim varken sol ray + kart. Yani
 * aynı sayfanın iki hâli vardı ve aralarında gidip gelmek gerekiyordu — "tüm depolar"a dönmeden
 * ikinci tesise bakılamıyordu. Kullanıcının tarifi tek cümleydi: *"başlığın hemen altına depo
 * isimlerini koyalım, seçtiği deponun detayı aşağıda görünsün."* Şerit yatay olunca liste
 * görünümüne gerek kalmıyor: tesisler her zaman görünür, detay hep altta.
 *
 * ── SIRA SÜRÜKLENEBİLİR VE BU BİR İŞLEV ──────────────────────────────────────
 * Sıralama liste görünümünden BURAYA taşındı, kaybolmadı: operatörün dizdiği sıra sistemdeki
 * **bütün** depo seçicilerinde geçerli (bağlam seçicisi, tablo süzgeci, transfer hedefi). Şerit onu
 * taşımasaydı sıralama yapılabilecek tek yer yok olurdu.
 *
 * Sürüklemek ile seçmek çakışmıyor: sürükle-bırak 5 px hareket eşiği istiyor, hareketsiz basış
 * normal tıklama olarak işliyor (galeri karesinin ölçülmüş deseni, `image-gallery.tsx`).
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

/** Şeritteki tek tesis. Seçili olan sol kenarından işaretlenir — rozet değil, kenar: sessiz ama net. */
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

/** Şeritteki alt satır: tesisin durumu tek cümlede. Sıralama ağırlığa göre — en kötü hâl kazanır. */
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

// ── `FactCard` KALKTI (17.08) ─────────────────────────────────────────────────────────────────
// Künye bölümünün kutusuydu; bölüm kaldırılınca tek tüketicisi kalmadı. Dört karttan üçü başlığın
// tekrarıydı (kod · ülke · kargo çıkışı), dördüncüsü hemen altındaki personel listesinin sayısı.

/**
 * Bölge kartı — ad + günler + kodlar + **ağırlık** (19.28). Kodlar bölgenin gerçeği, gün onu
 * taşıyan katman, ağırlık ise sonucu.
 *
 * Kart 17.08'e kadar yalnız TANIMI gösteriyordu ("ne kurduk"). Tanım tek başına bir karar
 * verdirmez: teslim günü eklemek mi, kod çıkarmak mı, hiç dokunmamak mı — hepsi bölgenin ne
 * getirdiğine bağlı. Sayılar Rotalar ekranıyla AYNI kaynaktan (`analytics_postal_code_orders` +
 * `zone_notice`); iki ekran aynı soruya iki farklı sayı vermesin.
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
 * Karne — **SAYAR, LİSTELEMEZ.** Her sayı Stok'a bu depo bağlamıyla giden bir kapıdır; parti listesi
 * orada yaşar, burada tekrarlanmaz (iki sahipli bir liste, bir gün ayrışan iki liste demektir).
 *
 * **Dört kutu, tek sıra — budandı (17.08).** Beşinci kutu "Yolda bekleyen"di ve depolar arası
 * transferi sayıyordu; tek depolu kurulumda transfer diye bir olay yok, yani kutu kendi tanımı
 * gereği daima `0 / 0`. Sıfırı sabit gösteren bir ölçü, ölçü değildir. Yanındaki üç cümlelik
 * açıklama kutusu da kalktı: eşik altının iki yolu olduğunu ANLATMAK yerine ekran onu zaten
 * yapıyor (sayı Stok'a, tedarik kutusu Tedarik'e gidiyor).
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
        {/* "eşik depo bazlıdır" notu düştü: karşılaştırılacak ikinci depo yokken bir ayrım değil,
            yalnız kuralın tekrarı. Kural veride ve `DOMAIN §17`de yazılı. */}
        <ScoreTile tone="red" label="Eşik altı" value={num(card.belowMinCount)} note="varyant" href="/operations/procurement" />
        <ScoreTile
          label="Açık iş"
          value={num(card.openOrderCount)}
          note="buradan çıkacak, teslim edilmemiş sipariş"
          href={ordersLink({ depo: code })}
        />
      </div>
      {/* Son mal girişi bir VERİDİR, açıklama değil — kutu kalkarken o kalıyor. */}
      <span className="px-0.5 font-ops-body text-ops-xs text-ops-muted">
        Son mal girişi: {card.lastIntakeAt ? shortDateTime(card.lastIntakeAt) : 'hiç giriş yok'}
      </span>
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
 * **Ölçüm noktaları** (19.28, kullanıcı isteği 17.08) — depo içi alanlar + bu tesise künyelenmiş
 * araçlar.
 *
 * Sayfanın kendi sorusuna cevap veren bir bölüm: *"bu tesis ne durumda"* sorusunun hijyen ayağı.
 * Nokta bir KÜNYEDİR — tesis kapalıyken de dolabı vardır — o yüzden karnenin aksine kapalı tesiste
 * de okunuyor.
 *
 * **Hiç ölçülmemiş nokta İŞARETLİ.** Tanımlanmış ama tura hiç girmemiş bir dolap, bir kurulum
 * eksikliğidir: nokta var, alışkanlığı yok, sapma ölçütü de yok. Bu bölüm o boşluğun görüldüğü tek
 * yer — sıcaklık ekranı yalnız BUGÜNÜ sorar.
 *
 * **Pasif nokta SÜZÜLMEZ, işaretlenir:** kullanımdan kalkmış bir dolabı gizlemek, geçmiş
 * kayıtlarının sahibini görünmez yapardı (kataloğun `isActive` ayrımı).
 */
export function MeasurePoints({
  points,
  onAdd,
  onEdit,
  onToggle,
}: {
  points: readonly MeasurePointView[];
  onAdd: (kind: 'area' | 'vehicle') => void;
  onEdit: (point: MeasurePointView) => void;
  onToggle: (point: MeasurePointView) => void;
}) {
  const areas = points.filter((point) => point.kind === 'area');
  const vehicles = points.filter((point) => point.kind === 'vehicle');
  const neverMeasured = points.filter((point) => point.isActive && point.lastRecordedAt === null).length;

  return (
    <div className="flex flex-col gap-2.5">
      {neverMeasured > 0 ? (
        <SetupGapNote
          text={`${num(neverMeasured)} nokta hiç ölçülmemiş — tanımlı ama tura girmemiş. Sapma uyarısı ancak geçmiş biriktikçe çalışır.`}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <PointColumn
          title="Depo içi alanlar"
          empty="Henüz alan yok — dolap, soğuk oda ya da geçiş alanı ekleyin."
          points={areas}
          onAdd={() => onAdd('area')}
          addLabel="+ Alan"
          onEdit={onEdit}
          onToggle={onToggle}
        />
        <PointColumn
          title="Araçlar"
          empty="Bu tesise künyelenmiş araç yok."
          points={vehicles}
          onAdd={() => onAdd('vehicle')}
          addLabel="+ Araç"
          onEdit={onEdit}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}

/** Tek sütun — başlık + ekle düğmesi + satırlar. İki sütun aynı bileşeni paylaşıyor (kopya yok). */
function PointColumn({
  title,
  empty,
  points,
  addLabel,
  onAdd,
  onEdit,
  onToggle,
}: {
  title: string;
  empty: string;
  points: readonly MeasurePointView[];
  addLabel: string;
  onAdd: () => void;
  onEdit: (point: MeasurePointView) => void;
  onToggle: (point: MeasurePointView) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-ops-display text-ops-xs font-semibold uppercase tracking-wide text-ops-muted">{title}</span>
        <span className="font-ops-body text-ops-xs text-ops-faint">{num(points.length)}</span>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={onAdd}>
          {addLabel}
        </Button>
      </div>

      {points.length === 0 ? (
        <p className={cardClass('px-3 py-2.5 font-ops-body text-ops-xs leading-relaxed text-ops-muted')}>{empty}</p>
      ) : (
        <ul className="flex flex-col rounded-ops-card border border-ops-line">
          {points.map((point) => (
            <li
              key={`${point.kind}:${point.id}`}
              className={`flex items-center gap-2 border-b border-ops-line-soft px-3 py-2 last:border-b-0 ${
                point.isActive ? '' : 'bg-ops-subtle'
              }`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-ops-body text-ops-sm text-ops-ink">{point.name}</span>
                  {point.label ? <span className="truncate font-ops-body text-ops-xs text-ops-muted">{point.label}</span> : null}
                  {point.areaKind ? <Badge tone="slate">{AREA_KIND_SHORT[point.areaKind]}</Badge> : null}
                  {point.isActive ? null : <Badge tone="slate">Pasif</Badge>}
                </span>
                <span className="font-ops-body text-ops-micro text-ops-muted">
                  {/* Beklenen aralık ve son ölçüm YAN YANA: "ne bekleniyor" ile "en son ne zaman
                      bakıldı" birlikte okunmadan nokta hakkında karar verilemez. */}
                  {point.targetMinC !== null && point.targetMaxC !== null
                    ? `${degree(point.targetMinC)} … ${degree(point.targetMaxC)} · `
                    : ''}
                  {point.lastRecordedAt ? `son ölçüm ${shortDateTime(point.lastRecordedAt)}` : 'hiç ölçülmedi'}
                </span>
              </span>

              <button
                type="button"
                onClick={() => onEdit(point)}
                className="shrink-0 cursor-pointer rounded-ops-btn px-2 py-1 font-ops-body text-ops-xs text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
              >
                Düzenle
              </button>
              {/* SİLME YOK: kayıtlı nokta veritabanında zaten silinemiyor (`restrict`) ve
                  silinebilseydi denetim geçmişi sahipsiz kalırdı. Susturmak yeter. */}
              <button
                type="button"
                onClick={() => onToggle(point)}
                className="shrink-0 cursor-pointer rounded-ops-btn px-2 py-1 font-ops-body text-ops-xs text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
              >
                {point.isActive ? 'Pasife al' : 'Geri aç'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "−18°" — sıcaklık kartıyla aynı biçim; eksi işareti U+2212 (mono yazıtipinde tire ayraç gibi okunuyor). */
function degree(celsius: number): string {
  return `${celsius.toLocaleString('tr-TR', { maximumFractionDigits: 1 }).replace('-', '−')}°`;
}
