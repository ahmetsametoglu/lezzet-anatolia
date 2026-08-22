'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { cardClass } from '@/components/operation/ui/card';
import { Button } from '@/components/operation/ui/button';
import { WarehouseIcon } from '@/components/operation/ui/icons';
import { ScoreTile } from '@/components/operation/ui/score-tile';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { money, num, shortDate, shortDateTime } from '@/components/operation/ui/format';
import type { Country } from '@lezzet/types';
import { ordersLink } from '../orders/orders-url';
import { settingsLink } from '../settings/settings-url';
import { stockLink } from '../stock/stock-url';
import { LABEL_SIZE_OPTIONS, postalCodeLabel, weekdayList } from './warehouses-labels';
import type { ScorecardView, StaffChipView, WarehouseRowView, ZoneCardView } from './warehouses-types';

// Depolar ekranının bölümleri — liste ve kart görünümü AYNI parçaları kullanır. Bölümler burada
// durur ki "karne başka yerde başka şey sayar" gibi bir ayrışma doğmasın.

// ── `ShippingGapBanner` KALKTI (17.08) ────────────────────────────────────────────────────────
// "Şu ülkede kargo çıkış deposu yok" uyarısıydı ve tek ülkeli bir kurulumda hiç tetiklenmiyordu.
// İkinci ülke açıldığı gün bu bir KURULUM kararıdır: künye penceresi kargo çıkışını zaten soruyor
// ve ülke başına tekliği veritabanı kısıtı reddediyor (`warehouse_single_online`). Uyarı bir
// eksikliği söylüyordu ama eksikliğin doğduğu yerde değil, ondan uzakta duruyordu.

// `SetupGapNote` ve `SectionHead` BURADAN GİTTİ (19.32) → `@/components/operation/ui/section-head`.
// İkinci tüketici Hazırlık'ın karşılama ekranı: aynı sarı kutu, aynı bölüm başlığı. Bir sayfanın
// altında duran komponent ikinci ekranda kopyalanırsa ikisi ayrışır (`CLAUDE.md §2` yerleşim kuralı).

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

// `ScoreTile` de BURADAN GİTTİ (19.32) → `@/components/operation/ui/score-tile`. Hazırlık'ın
// karşılama ekranı aynı kutuyu çiziyor; iki kopya, "amber"in bir ekranda uyarı ötekinde dekorasyon
// olmasına giden yoldu. "Yolda bekleyen"in bilerek kapısız oluşu gibi kutuya özel gerekçeler
// kutunun kendi künyesinde.

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
 * **Etiket yazıcısı** (23.7) — kurulum künyesi: kutu kapanışında 4×6 etiketi basan Brother QL.
 * Tanımsızlık bir ARIZA değil bir hâldir (depo etiketsiz çalışabilir) ama amber'le söylenir:
 * kutu akışı kurulmuş bir depoda yazıcısızlık büyük olasılıkla unutulmuş kurulumdur.
 */
export function PrinterCard({ printer, onEdit }: { printer: { address: string; model: string; labelSize: string } | null; onEdit: () => void }) {
  const size = LABEL_SIZE_OPTIONS.find((o) => o.value === printer?.labelSize)?.label ?? printer?.labelSize;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {printer ? (
        <span className="flex items-center gap-1.5 rounded-full border border-ops-line bg-ops-card px-3 py-1.5 font-ops-body text-ops-sm text-ops-strong">
          {printer.model}
          <span className="font-ops-mono text-ops-xs text-ops-muted">{printer.address}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">· {size}</span>
        </span>
      ) : (
        <span className="font-ops-body text-ops-sm text-ops-amber">
          Yazıcı tanımlı değil — kutu kapanışında etiket basılmaz, telefon yalnız önizleme gösterir.
        </span>
      )}
      <Button variant="secondary" size="sm" onClick={onEdit}>
        {printer ? 'Düzenle' : 'Yazıcı tanımla'}
      </Button>
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


// ── ÖLÇÜM NOKTALARI BU DOSYADAN GİTTİ (19.30) → `measure-points.tsx` ────────────────────────────
// Bölüm iki sütundu (alanlar | araçlar) ve satırları statikti. Bugün kendi durumunu taşıyor
// (tür süzgeci, açılan takvim, bugüne kayıt), yani artık bir "bölüm" değil bir EKRAN — ve bu
// dosyanın sözleşmesi durumsuz bölümler. Nokta satırının gerekçeleri de onunla taşındı.
