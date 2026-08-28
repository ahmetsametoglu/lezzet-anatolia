'use client';

import type { ReactNode } from 'react';
import { toCents } from '@lezzet/helper';
import {
  ALLERGEN_LABELS,
  NUTRITION_KEYS,
  NUTRITION_LABELS,
  PROPOSAL_PAYLOAD_SCHEMAS,
  ProductAllergenEnum,
  resolveLocalizedText,
  type AssistantProposalKind,
  type BundleDraftPayload,
  type FeaturedFlagPayload,
  type MoneyMovementPayload,
  type Nutrition,
  type ProductAllergen,
  type ProductCreatePayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type ZoneExtendPayload,
} from '@lezzet/types';
import type { ProposalEconomics } from '@/lib/assistant/economics';
import { FEATURED_SLOTS } from '@lezzet/types';
import { AlertIcon } from '@/components/operation/ui/icons';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { money, num, percent, shortDate } from '@/components/operation/ui/format';
import { DECLARATION_FIELD_LABEL, splitVariantName } from './assistant-labels';

/**
 * ÖNİZLEME — çizimin "tipe göre değişen tek bölüm"ü (`Operasyon - Asistan Kuyrugu.dc.html`).
 *
 * Kuralı brief yazıyor (`design/pages/admin-asistan-kuyrugu.md §2`): **ham JSON asla ana yüzey
 * değildir.** Operatöre `{"items":[{"variantId":"a3f…"}]}` göstermek, onaydan anlam beklemeyi
 * bırakmaktır — üç kez sonra herkes okumadan onaylar. Burada gösterilen şey işlemin SONUCUDUR:
 * paket önerisinde müşterinin göreceği kart, stok girişinde parti tablosu, para hareketinde
 * muhasebe satırının kendisi. JSON, kartın altındaki katlanmış "Teknik döküm"de durur.
 *
 * **Çerçeve her tipte AYNI, değişen yalnız gövde:** öğrenilecek tek bir ekran olsun diye (brief §2).
 */

/** Önizleme kabuğu — başlık bandı + gövde. Her tip aynı kabuğa girer. */
function PreviewBody({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-ops-card border border-ops-line bg-ops-white">
      <div className="flex items-center gap-2 border-b border-ops-line-soft bg-ops-subtle px-3.5 py-2">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-body">
          Önizleme — uygulanınca oluşacak kayıt
        </span>
        <span className="ml-auto font-ops-body text-ops-xs text-ops-faint">{note}</span>
      </div>
      <div className="flex flex-col gap-3 p-3.5">{children}</div>
    </div>
  );
}

/**
 * Önizlemenin mini tablosu — çizimin beş kalem tablosunun ortak iskeleti.
 *
 * `ui/table` DEĞİL ve olmamalı: o bileşen bir EKRAN tablosudur (kaydırılan gövde, sabit başlık,
 * iskelet satırlar, boş hâl, sonsuz kaydırma). Buradaki tablo bir kartın içine gömülü, sabit
 * yükseklikte ve daima dolu bir özet — o yeteneklerin hiçbirine ihtiyacı yok, hepsinin ağırlığına
 * ise ihtiyacı hiç yok (kart içinde `flex-1` bir tablo kartı büyütürdü).
 */
interface PreviewColumn<Row> {
  key: string;
  header: string;
  /** CSS grid track (`1fr`, `92px`). */
  width: string;
  align?: 'right';
  mono?: boolean;
  cell: (row: Row) => ReactNode;
  /** Satırın vurgulanması gerekiyorsa (riskli SKT) — hücre sınıfı. */
  cellClass?: (row: Row) => string;
}

function PreviewTable<Row>({
  columns,
  rows,
  rowKey,
  rowClass,
}: {
  columns: PreviewColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  rowClass?: (row: Row) => string;
}) {
  const template = columns.map((c) => c.width).join(' ');
  return (
    <div className="overflow-hidden rounded-ops-card border border-ops-line">
      <div
        style={{ gridTemplateColumns: template }}
        className="grid gap-x-2.5 border-b border-ops-line bg-ops-subtle px-3 py-1.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-muted"
      >
        {columns.map((c) => (
          <span key={c.key} className={c.align === 'right' ? 'text-right' : ''}>
            {c.header}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={rowKey(row, i)}
          style={{ gridTemplateColumns: template }}
          className={[
            'grid gap-x-2.5 border-b border-ops-line-soft px-3 py-2 font-ops-body text-ops-sm text-ops-ink last:border-b-0',
            rowClass?.(row) ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {/* Hücre SARAR, kırpmaz. Kırpılan bir önizleme onayın işini görmez: ürün farkı tablosunda
              asistanın yazdığı cümlenin yarısı "…" olunca operatör tam da onaylayacağı metni
              göremiyor (ölçüldü). Sayı/tarih sütunları tek satırda kalır — onlar zaten kısa ve
              sarmaları hizayı bozar. */}
          {columns.map((c) => (
            <span
              key={c.key}
              className={[
                'min-w-0 break-words',
                c.align === 'right' ? 'whitespace-nowrap text-right' : '',
                c.mono ? 'font-ops-mono' : '',
                c.cellClass?.(row) ?? '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {c.cell(row)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * **KÂR SATIRI** — "bu karar bize ne kazandırıyor" (22.7 · harici denetimin bulgusu).
 *
 * ── NEDEN ROZET DEĞİL DE CÜMLE ──────────────────────────────────────────────
 * Zarar bir ARIZA değil, bilinçli verilebilecek bir karardır: elde kalıp imha edilecek maldan
 * zararına satış iyidir. Kırmızı bir rozet operatörü düşünmeden geri adım attırırdı; bu yüzden
 * `offer-dialog`un kâr satırıyla aynı dil kullanılıyor — **tutarıyla söyle, yolu kapatma.**
 * İki ekran aynı karara iki farklı cevap vermemeli.
 *
 * ── MALİYET BİLİNMİYORSA HESAP YAPILMAZ ─────────────────────────────────────
 * `null` maliyet "sıfır maliyet" değildir (`CLAUDE §1`). Sıfır sayılsaydı ekran **"%100 kâr"**
 * gösterirdi — yanlışın en tehlikelisi, çünkü ikna edici. O hâlde cümle neyin eksik olduğunu
 * söylüyor ve kararı liste fiyatına bırakıyor.
 */
function MarginLine({
  marginCents,
  marginPercent,
  missingCost,
}: {
  marginCents: number | null;
  marginPercent: number | null;
  /** Maliyeti bilinmeyen kalem var mı — cümleyi bu belirler, sayı değil. */
  missingCost: boolean;
}) {
  if (missingCost || marginCents === null) {
    return (
      <span className="font-ops-body text-ops-sm leading-relaxed text-ops-muted">
        {missingCost
          ? 'Alış fiyatı girilmemiş bir kalem var — kâr hesaplanamıyor. Karar yalnız liste fiyatına göre verilebilir.'
          : 'Kâr hesaplanamıyor: fiyat ya da maliyet eksik.'}
      </span>
    );
  }

  const tone = marginCents > 0 ? 'text-ops-olive-dark' : marginCents === 0 ? 'text-ops-body' : 'text-ops-amber';
  const verdict = marginCents > 0 ? `${money(marginCents)} kâr` : marginCents === 0 ? 'başa baş' : `${money(-marginCents)} zarar`;

  return (
    <span className="font-ops-body text-ops-sm leading-relaxed text-ops-body">
      <span className={`font-ops-mono font-semibold ${tone}`}>{verdict}</span>
      {marginPercent !== null ? <span className="text-ops-muted"> ({percent(marginPercent, 1)} marj)</span> : null}
      {marginCents < 0 ? (
        <span className="text-ops-muted">
          {' '}
          — zararına satmak bir karardır (elde kalıp imha edilecek maldan iyidir), ekran yolu kapatmaz.
        </span>
      ) : null}
    </span>
  );
}

/** Tablonun üstündeki künye satırı ("Hedef depo: D1 · Belge no: 2026/0418"). */
function FactRow({ facts }: { facts: Array<{ label: string; value: string; mono?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-ops-body text-ops-sm text-ops-body">
      {facts.map((f) => (
        <span key={f.label}>
          {f.label}:{' '}
          <strong className={`font-semibold text-ops-ink ${f.mono ? 'font-ops-mono' : ''}`}>{f.value}</strong>
        </span>
      ))}
    </div>
  );
}

/** Önizlemenin içindeki uyarı kutusu — kırmızı (risk) ya da amber (geri alınamaz dış etki). */
function PreviewNotice({ tone, title, children }: { tone: 'red' | 'amber'; title?: string; children: ReactNode }) {
  const skin =
    tone === 'red'
      ? 'border-ops-red-line bg-ops-red-bg text-ops-red'
      : 'border-ops-amber-line border-l-[3px] border-l-ops-amber-dot bg-ops-amber-bg text-ops-amber-dark';
  // Başlıklı kutu kendi adıyla konuşuyor; başlıksız olan ikonla — çizimin iki hâli de bu
  // (stok kutusunda üçgen uyarı, bölge kutusunda "Geri alınamaz dış etki" başlığı).
  return (
    <div className={`flex items-start gap-2.5 rounded-ops-card border px-3.5 py-2.5 ${skin}`}>
      {title ? null : (
        <span className="mt-px flex-none">
          <AlertIcon size={15} />
        </span>
      )}
      <span className="flex flex-col gap-1">
        {title ? (
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em]">{title}</span>
        ) : null}
        <span className="font-ops-body text-ops-sm font-medium leading-relaxed">{children}</span>
      </span>
    </div>
  );
}

// ── Tip başına gövdeler ──────────────────────────────────────────────────────

/**
 * Paket taslağı — çizimin "müşterinin göreceği kart" + kalem tablosu + mutabakat rozeti.
 *
 * Fiyatlar EURO'dur, cent değil (`BundleDraftPayloadSchema`: paket ailesi henüz cent'e göçmedi) —
 * bu yüzden gösterime `toCents` ile girer: biçimlendirme tek kaynaktan (`format.money`) geçsin ve
 * burada ikinci bir "virgüllü yazma" kararı doğmasın.
 *
 * **Mutabakat rozeti ekranın kendi hesabı DEĞİL, motorun kuralının aynası:** paylar toplamı paket
 * fiyatını tutmuyorsa motor zaten reddedecek (`applyProposal`), ve operatörün bunu ONAYDAN ÖNCE
 * görmesi gerekir — yoksa "uygula" der, "uygulanamadı" alır ve sebebi aramaya gider.
 */
function BundlePreview({
  payload,
  economics,
}: {
  payload: BundleDraftPayload;
  economics: Extract<ProposalEconomics, { kind: 'bundle' }> | null;
}) {
  // Maliyet kalem SIRASIYLA eşleşiyor (kapı payload'ın kalemlerinden kuruyor) — kimlikle eşleme
  // ikinci bir varsayım olurdu ve aynı varyant iki kez yazılırsa yanlış satıra düşerdi.
  const lines = payload.items.map((item, i) => ({
    ...item,
    ...splitVariantName(item.productName),
    costCents: economics?.lines[i]?.costCents ?? null,
  }));
  const allocated = payload.items.reduce((sum, i) => sum + i.qty * i.allocatedUnitPrice, 0);
  // Kuruş altı yuvarlama farkı mutabakatsızlık değildir; karşılaştırma cent'te yapılır.
  const balanced = toCents(allocated) === toCents(payload.totalPrice);
  const gap = toCents(allocated) - toCents(payload.totalPrice);

  return (
    <PreviewBody note="katalog · paket kartı">
      <div className="flex items-center gap-3.5 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
        {/* Görsel YOK ve olmayacak: asistan görsel yüklemiyor, paket pasif doğuyor. Kutu bunu
            söylüyor — boş bir çerçeve bırakmak "görsel yüklenemedi" diye okunurdu. */}
        <span className="grid h-[78px] w-[78px] flex-none place-items-center rounded-ops-card border-[1.5px] border-dashed border-ops-gray-500 p-1.5 text-center font-ops-body text-ops-micro leading-tight text-ops-faint">
          görsel yok
          <br />
          pasif doğar
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-ops-display text-ops-micro font-normal uppercase tracking-[0.1em] text-ops-muted">
            Müşterinin göreceği kart
          </span>
          <span className="truncate font-ops-display text-ops-lead font-semibold text-ops-ink">
            {resolveLocalizedText(payload.name, OPERATIONS_LOCALE)}
          </span>
          {payload.description ? (
            <span className="font-ops-body text-ops-sm leading-relaxed text-ops-body">
              {resolveLocalizedText(payload.description, OPERATIONS_LOCALE)}
            </span>
          ) : null}
        </span>
        <span className="flex-none font-ops-mono text-ops-section font-semibold text-ops-ink">
          {money(toCents(payload.totalPrice))}
        </span>
      </div>

      <PreviewTable
        columns={[
          { key: 'ad', header: 'Ürün', width: '1fr', cell: (l) => l.name },
          { key: 'boy', header: 'Boy', width: '96px', cell: (l) => l.size ?? '—' },
          { key: 'adet', header: 'Adet', width: '62px', align: 'right', mono: true, cell: (l) => num(l.qty) },
          {
            key: 'pay',
            header: 'Atanan pay',
            width: '92px',
            align: 'right',
            mono: true,
            cell: (l) => money(toCents(l.qty * l.allocatedUnitPrice)),
          },
          // Maliyet sütunu YALNIZ künye geldiğinde: sütunu boş çizmek "maliyet sıfır" diye
          // okunabilirdi ve o, kârlılığı görünmez kılmaktan daha kötü.
          ...(economics
            ? [
                {
                  key: 'alis',
                  header: 'Alış (KDV hariç)',
                  width: '116px',
                  align: 'right' as const,
                  mono: true,
                  cell: (l: (typeof lines)[number]) =>
                    l.costCents === null ? '—' : money(l.costCents * l.qty),
                },
              ]
            : []),
        ]}
        rows={lines}
        rowKey={(l) => l.variantId}
      />

      {/* **KÂRLILIK — mutabakat rozetiyle AYNI ağırlıkta** (denetimin talebi): ikisi de "bu paket
          kurulmalı mı" sorusunun parçası. Paylar tutuyor olabilir ve paket yine zararına olabilir;
          bir tur bu ekran yalnız ilkini söylüyordu ve zararına bir paket sessizce onaylanabiliyordu. */}
      {economics ? (
        <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
            Bu paket ne kazandırıyor
          </span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Paket {money(economics.priceCents)} (KDV dahil)
            {economics.priceHtCents !== null ? ` · ${money(economics.priceHtCents)} KDV'siz gelir` : ''}
            {economics.costTotalCents !== null ? ` − ${money(economics.costTotalCents)} alış` : ''}
          </span>
          <MarginLine
            marginCents={economics.marginCents}
            marginPercent={economics.marginPercent}
            missingCost={economics.costTotalCents === null}
          />
        </div>
      ) : null}

      <span
        className={[
          'self-start rounded-ops-card border px-2.5 py-1.5 font-ops-display text-ops-xs font-semibold',
          balanced
            ? 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
            : 'border-ops-red-line bg-ops-red-bg text-ops-red',
        ].join(' ')}
      >
        {balanced
          ? `Paylar toplamı ${money(toCents(allocated))} — paket fiyatını tutuyor`
          : `Paylar toplamı ${money(toCents(allocated))} — paket fiyatından ${money(Math.abs(gap))} ${gap > 0 ? 'fazla' : 'eksik'}`}
      </span>
    </PreviewBody>
  );
}

/**
 * Stok girişi — çizimin parti tablosu.
 *
 * **Riskli satır YALNIZ ölçülebilen risktir:** tarihi geçmiş ya da bugün dolan parti kırmızı
 * yazılır, çünkü bu payload'dan doğrudan okunur. Çizimin "8 gün içinde SKT'ye giriyor" uyarısı
 * ise ölçülemiyor — "yaklaşan son tarih" kararı bizde MUTLAK GÜNLE değil kalan raf ömrü YÜZDESİYLE
 * veriliyor (`domain-core/stock/shelf-life.ts`: 3 gün taze börekte normal, uzun ömürlü üründe
 * alarm) ve payload ürünün toplam raf ömrünü taşımıyor. Uydurma bir gün eşiği, alan kuralıyla
 * çelişen bir alarm üretirdi.
 *
 * Payload'a `shelfLifeDays` (ya da hazır `expiryFlag`) eklenirse yakın-SKT vurgusu buraya döner;
 * kayıt `BEKLEYEN(22.13)`te (payload alan eksikleri orada toplanıyor).
 */
function StockIntakePreview({ payload }: { payload: StockIntakePayload }) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = payload.lines.map((line) => ({ ...line, ...splitVariantName(line.productName), past: line.expiryDate <= today }));
  const pastCount = lines.filter((l) => l.past).length;

  return (
    <PreviewBody note="stok · parti tablosu">
      <FactRow
        facts={[
          { label: 'Hedef depo', value: payload.warehouseCode },
          ...(payload.supplierName ? [{ label: 'Tedarikçi', value: payload.supplierName }] : []),
          ...(payload.documentNo ? [{ label: 'Belge no', value: payload.documentNo, mono: true }] : []),
          // Belge tarihi (11.08): verilmediyse kabul BUGÜNE yazılacak ve bu SÖYLENİR — sessiz
          // varsayım onaylanmaz, çünkü fatura genelde dünküdür.
          { label: 'Belge tarihi', value: payload.date ? shortDate(payload.date) : 'yok — bugüne yazılacak' },
          ...(payload.totalAmountCents === null ? [] : [{ label: 'Fatura toplamı', value: money(payload.totalAmountCents), mono: true }]),
        ]}
      />

      <PreviewTable
        columns={[
          { key: 'ad', header: 'Ürün', width: '1fr', cell: (l) => l.name },
          { key: 'boy', header: 'Boy', width: '92px', cell: (l) => l.size ?? '—' },
          { key: 'adet', header: 'Adet', width: '58px', align: 'right', mono: true, cell: (l) => num(l.qty) },
          {
            key: 'skt',
            header: 'SKT',
            width: '104px',
            align: 'right',
            mono: true,
            cell: (l) => shortDate(l.expiryDate),
            cellClass: (l) => (l.past ? 'font-semibold text-ops-red' : ''),
          },
          { key: 'lot', header: 'Lot', width: '96px', align: 'right', mono: true, cell: (l) => l.lotNumber ?? '—' },
        ]}
        rows={lines}
        rowKey={(l, i) => `${l.variantId}-${i}`}
        rowClass={(l) => (l.past ? 'bg-ops-red-bg' : '')}
      />

      {pastCount > 0 ? (
        <PreviewNotice tone="red">
          {pastCount === 1 ? 'Bir parti' : `${num(pastCount)} parti`} son kullanma tarihini geçmiş ya da bugün
          doluyor — girişten hemen sonra imha/indirim kararı gerekir.
        </PreviewNotice>
      ) : null}
    </PreviewBody>
  );
}

/** Para hareketi — çizimin "muhasebe satırının kendisi" (anahtar/değer listesi). */
function MoneyPreview({ payload }: { payload: MoneyMovementPayload }) {
  const incoming = payload.direction === 'in';
  const rows: Array<{ k: string; v: string; mono?: boolean; className?: string }> = [
    { k: 'Hesap', v: payload.accountName },
    // "Tür" satırı YÖNDEN gelir (çizimin iki hâli: Gider ↔ Tahsilat). Hareketin iç tipi
    // (`purchase`/`transfer`…) burada yazılmaz: onun sözlüğü Para ekranının kendi sözlüğüdür ve
    // ikinci kez yazılması kaçınılmaz olarak ayrışırdı; ayrımı zaten özet cümlesi taşıyor.
    // Transfer ÜÇÜNCÜ bir hâl: para şirketten çıkmıyor, hesap değiştiriyor. "Gider" demek onu
    // kaybedilmiş para gibi okutur ve kırmızıya boyardı (11.08).
    {
      k: 'Tür',
      v: payload.counterAccountName ? 'Transfer' : incoming ? 'Tahsilat' : 'Gider',
      className: payload.counterAccountName ? 'text-ops-ink' : incoming ? 'text-ops-olive-dark' : 'text-ops-red',
    },
    // Paranın gittiği hesap kararın YARISI: "Kasa → ?" diye bir transfer onaylanamaz.
    ...(payload.counterAccountName ? [{ k: 'Hedef hesap', v: payload.counterAccountName }] : []),
    ...(payload.category ? [{ k: 'Kategori', v: payload.category }] : []),
    { k: 'Tutar', v: money(payload.amountCents), mono: true },
    ...(payload.counterpartyName ? [{ k: 'Karşı taraf', v: payload.counterpartyName }] : []),
    ...(payload.valueDate ? [{ k: 'Tarih', v: shortDate(payload.valueDate), mono: true }] : []),
    ...(payload.description ? [{ k: 'Açıklama', v: payload.description }] : []),
  ];

  return (
    <PreviewBody note="para · muhasebe satırı">
      <span className="font-ops-body text-ops-xs text-ops-muted">
        Muhasebe satırının kendisi — uygulanınca aynen bu satır yazılır.
      </span>
      <div className="overflow-hidden rounded-ops-card border border-ops-line">
        {rows.map((r) => (
          <div key={r.k} className="grid grid-cols-[150px_1fr] gap-3 border-b border-ops-line-soft px-3.5 py-2 last:border-b-0">
            <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.05em] text-ops-muted">
              {r.k}
            </span>
            <span
              className={['min-w-0 break-words font-ops-body text-ops-sm font-medium text-ops-ink', r.mono ? 'font-ops-mono' : '', r.className ?? '']
                .filter(Boolean)
                .join(' ')}
            >
              {r.v}
            </span>
          </div>
        ))}
      </div>
    </PreviewBody>
  );
}

/**
 * Bölge genişletme — çizimin posta kodu tablosu + **turuncu geri-alınamaz kutusu**.
 *
 * Kutu dekor değil: kod bölgeye girince `zone_available` uzlaştırması haber bekleyenlere bildirim
 * gönderir (`ZoneExtendPayloadSchema` künyesi) ve bu tek yönlüdür — bölge kapatılsa bile mesaj
 * gitmiş olur. Sayı payload'dan gelir; bekleyen yoksa cümle de küçülür, çünkü o zaman geri
 * alınamayan bir şey de yoktur.
 */
function ZonePreview({ payload }: { payload: ZoneExtendPayload }) {
  const waiting = payload.postalCodes.reduce((sum, c) => sum + c.waitingCount, 0);

  return (
    <PreviewBody note="bölge · posta kodu listesi">
      <FactRow facts={[{ label: 'Hedef bölge', value: payload.zoneName }, { label: 'Ülke', value: payload.country }]} />

      <PreviewTable
        columns={[
          { key: 'kod', header: 'Posta kodu', width: '110px', mono: true, cell: (c) => c.postalCode },
          { key: 'yer', header: 'Yerleşim', width: '1fr', cell: (c) => c.placeName ?? '—' },
          { key: 'talep', header: 'Talep', width: '92px', align: 'right', mono: true, cell: (c) => num(c.requestCount) },
          {
            key: 'bekleyen',
            header: 'Haber bekleyen',
            width: '118px',
            align: 'right',
            mono: true,
            cell: (c) => num(c.waitingCount),
          },
        ]}
        rows={payload.postalCodes}
        rowKey={(c) => c.postalCode}
      />

      {waiting > 0 ? (
        <PreviewNotice tone="amber" title="Geri alınamaz dış etki">
          Uygulanınca haber bekleyen {num(waiting)} müşteriye “bölgeniz açıldı” bildirimi gider. Bildirim geri
          alınamaz; bölgeyi kapatsanız bile mesaj gitmiş olur.
        </PreviewNotice>
      ) : (
        <PreviewNotice tone="amber" title="Dış etki">
          Bu kodlarda haber bekleyen müşteri yok — bugün bildirim gitmez. Adres girişinde teslimat açılır.
        </PreviewNotice>
      )}
    </PreviewBody>
  );
}

/**
 * Ürün taslağı — "alan bazında fark" tablosu (üç dil yan yana) + **üzerine yazma uyarısı**.
 *
 * ── EN ÖNEMLİ SATIR: DOLU ALANIN ÜZERİNE YAZILIYOR (22.5 · denetim taraması) ─
 * `updateDetails` düz bir `update` ve sürüm tutmuyor: dolu bir açıklama onaylandığı an kaybolur,
 * geri getirilemez. Önizleme bir tur "boş alanlara asistanın yazdıkları" diyordu ama
 * karşılaştıracak eski değeri hiç almıyordu — yani vaadi doğrulanmamış bir varsayımdı. Payload
 * artık `currentFields` taşıyor ve tablo eski hâli de gösteriyor.
 *
 * Üç hâl AYRI ve üçü ayrı şey söylüyor: alan doluysa **kayıp uyarısı** (amber, geri alınamaz) ·
 * alan boşsa sessizce doldurulur · `currentFields` HİÇ yoksa "eski hâl okunamadı" denir ve
 * varsayılmaz — "boştu" demek, dolu bir alanı sessizce ezmenin en kolay yolu olurdu.
 *
 * ── ALERJEN DUVARI ŞEMADAN EKRANA TAŞINDI (kullanıcı kararı 09.08 · 22.6) ────
 * `allergens`/`storageInstructions` bir tur payload'da YOKTU (fiziksel engel). Ambalajın
 * fotoğrafını patron verdiği için bilgi artık uydurma değil belgeden okuma; duvar da kullanıcının
 * kendi cümlesiyle onay ekranına taşındı: *"en net duvarımız onay ekranımız."* Ekranın işi bu
 * yüzden doğrulama değil **inceleme** — eksik ve şüpheli olanı öne çıkarmak, doğru olanı sessizce
 * geçmek (brief `design/pages/admin-asistan-kuyrugu.md §5b`).
 */
function ProductDraftPreview({ payload }: { payload: ProductDraftPayload }) {
  const rows = declarationRows(payload.fields, payload.currentFields);
  const currentKnown = payload.currentFields !== undefined;

  /**
   * Ezilen alanlar: hem yazılıyor hem eski hâli DOLU. Sayı değil ADLARI gerekiyor — operatör "neyi
   * kaybediyorum" diye soruyor, "kaç tanesini" diye değil.
   *
   * Metin alanları tablodan, liste/künye alanları ayrıca: alerjen ve besin künyesi tabloda değil
   * kendi bloklarında çiziliyor (aşağıdaki gerekçe), ama üzerine yazılıyorlarsa uyarı yine onları
   * saymalı — yoksa dolu bir alerjen listesinin sessizce değiştiği bir yol açılırdı.
   */
  const overwritten = [
    ...rows.flatMap((r) => (r.overwrites ? [r.label] : [])),
    ...(currentKnown && payload.fields.allergens && (payload.currentFields?.allergens?.length ?? 0) > 0
      ? [DECLARATION_FIELD_LABEL.allergens!]
      : []),
    ...(currentKnown && payload.fields.nutrition && payload.currentFields?.nutrition
      ? [DECLARATION_FIELD_LABEL.nutrition!]
      : []),
  ];

  return (
    <PreviewBody note="ürün · alan farkı">
      <FactRow facts={[{ label: 'Ürün', value: payload.productName }]} />
      <span className="font-ops-body text-ops-xs text-ops-muted">
        {currentKnown
          ? 'Alan bazında fark — solda bugünkü hâli, sağda asistanın yazacağı.'
          : 'Asistanın yazacağı alanlar. Bu önerinin eski hâl kaydı yok.'}
      </span>

      {rows.length > 0 ? (
        <PreviewTable
          columns={[
            { key: 'alan', header: 'Alan', width: '118px', cell: (r) => r.label },
            { key: 'now', header: 'Bugün', width: '1fr', cell: (r) => r.current },
            { key: 'next', header: 'Yazılacak', width: '1fr', cell: (r) => r.next },
          ]}
          rows={rows}
          rowKey={(r) => r.key}
        />
      ) : null}

      <DeclarationBlocks fields={payload.fields} />

      {overwritten.length > 0 ? (
        <PreviewNotice tone="amber" title="Üzerine yazılacak">
          {overwritten.join(' ve ')} bugün DOLU ve onaylarsanız asistanın yazdığıyla değişecek. Bu kayıt geri
          alınamaz — eski değer hiçbir yerde saklanmıyor.
        </PreviewNotice>
      ) : null}

      {!currentKnown ? (
        <PreviewNotice tone="amber" title="Eski hâl okunamadı">
          Bu öneri alanların bugünkü hâlini taşımıyor, bu yüzden neyin üzerine yazılacağını söyleyemiyorum.
          Onaylamadan önce ürün ekranından bakın.
        </PreviewNotice>
      ) : null}

      <UncertainNotice uncertain={payload.uncertainFields} />
    </PreviewBody>
  );
}

/**
 * Yeni ürün — ambalajdan (22.6).
 *
 * Tamamlama önizlemesiyle aynı gövdeyi paylaşır (`DeclarationBlocks` · `UncertainNotice`) ve bu bilinçli:
 * ikisi de aynı soruya cevap veriyor — *"sisteme ne yazılıyor, neyi eksik bırakıyor?"*. Fark
 * kimlikte: yeni kayıt kategorisini, tarih tipini, raf ömrünü, KDV'sini ve en az bir boyunu da
 * getiriyor; karşılaştıracak "bugünkü hâl" ise yok (ortada henüz kayıt yok).
 *
 * **Fiyat · stok · görsel bu ekranda YOK ve yer tutucusu bile çizilmiyor** (brief): ayrı kararlar,
 * ayrı yetki sınıfları. Olmayan bir şeyi vaat etmemek için boş bir kutu bile konmuyor.
 */
function ProductCreatePreview({ payload }: { payload: ProductCreatePayload }) {
  const rows = declarationRows({ name: payload.name, ...pickDeclaration(payload) }, undefined);

  return (
    <PreviewBody note="katalog · yeni ürün">
      <FactRow
        facts={[
          { label: 'Kategori', value: payload.categoryName ?? 'seçilmedi' },
          // Ayrım GÜVENLİK ↔ KALİTE (ürün ekranının kendi cümlesi): DLC geçince mal satılamaz,
          // DDM geçince satılabilir ama kalite düşer. İkisi bir karar girdisidir, teknik bir kod değil.
          { label: 'Tarih tipi', value: payload.dateType === 'DLC' ? 'DLC · güvenlik' : 'DDM · kalite' },
          {
            label: 'Raf ömrü',
            value: payload.shelfLifeDays === null ? 'belirtilmedi' : `${num(payload.shelfLifeDays)} gün`,
          },
          // **Oran YÜZDEDİR, kesir değil** — `product.vat_rate` veride `5.50` duruyor ve motor da
          // öyle okuyor (`removeVat`: `1 + vatRate/100`). Bir tur burada 100 ile çarpılıyordu ve
          // canlı bir öneride ekrana **%550** yazdı (ölçüldü). Ondalık ŞART: Fransa'nın gıda oranı
          // %5,5 ve tam sayıya yuvarlansaydı "%6" görünürdü — var olmayan bir oran.
          { label: 'KDV', value: percent(payload.vatRate, 1) },
          // Kargolanabilirlik ambalajdan okunan bir karar (11.08) ve okunamadıysa öyle YAZILIR:
          // "Hayır" ile "bilinmiyor" arasındaki fark, donmuş bir ürünün kargoya çıkıp çıkmamasıdır.
          {
            label: 'Kargo',
            value: payload.shippable === null ? 'okunmadı — varsayılan: gönderilebilir' : payload.shippable ? 'Gönderilebilir' : 'Gönderilemez',
          },
          // Boy satırı artık ETİKETİ ve ÖLÇÜYÜ birlikte okur: "500 g" metni müşterinin gördüğü,
          // ölçü ise kilo başı fiyatın ve kargo hesabının tabanı — biri yazılıp öteki boş kalırsa
          // aynı bilgi yarım kaydedilmiş olur.
          {
            label: 'Boylar',
            value: payload.variants
              .map((v) => {
                // Ambalaj ölçüsü de künyeye giriyor (28.08): operatör onaylamadan önce asistanın
                // TAHMİN etmediğini görebilmeli — boşsa "ölçülmedi" yazar, uydurma sayı yazmaz.
                const dims =
                  v.packedLengthMm && v.packedWidthMm && v.packedHeightMm
                    ? `${num(v.packedLengthMm)}×${num(v.packedWidthMm)}×${num(v.packedHeightMm)} mm`
                    : null;
                const size = [
                  v.netWeightG ? `${num(v.netWeightG)} g` : null,
                  v.piecesCount ? `${num(v.piecesCount)} ${v.portionKind === 'slice' ? 'dilim' : 'ad.'}` : null,
                  v.packedWeightG ? `brüt ${num(v.packedWeightG)} g` : null,
                  dims,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return `${resolveLocalizedText(v.label)}${size ? ` (${size})` : ' (ölçü yok)'}`;
              })
              .join(' · '),
          },
        ]}
      />

      {rows.length > 0 ? (
        <PreviewTable
          columns={[
            { key: 'alan', header: 'Alan', width: '118px', cell: (r) => r.label },
            { key: 'next', header: 'Yazılacak', width: '1fr', cell: (r) => r.next },
          ]}
          rows={rows}
          rowKey={(r) => r.key}
        />
      ) : null}

      <DeclarationBlocks fields={pickDeclaration(payload)} />
      <UncertainNotice uncertain={payload.uncertainFields} />

      {/* ⑦ Emniyet bir UYARI değil, bir RAHATLAMA (brief): kayıt aday doğuyor, satışa çıkarmak bu
          ekranın işi değil. Kutuya konsaydı riskle aynı ağırlıkta okunurdu. */}
      <span className="font-ops-body text-ops-sm leading-relaxed text-ops-muted">
        Ürün <strong className="font-semibold text-ops-body">aday</strong> olarak doğar — vitrinde görünmez,
        satılamaz. Satışa çıkarmak ayrı bir karar ve asistanın hiçbir yoldan erişimi yok; yanlış okunmuş bir
        alerjen en kötü hâlde bile müşteriye ulaşmaz. Fiyat ve stok da bu öneriye dahil değil.
      </span>
    </PreviewBody>
  );
}

/** Yeni ürün payload'ından yalnız BEYAN alanlarını ayırır — kimlik alanları tabloya girmez. */
function pickDeclaration(payload: ProductCreatePayload) {
  return {
    description: payload.description,
    ingredients: payload.ingredients,
    storageInstructions: payload.storageInstructions,
    nutrition: payload.nutrition,
    allergens: payload.allergens,
    traces: payload.traces,
  };
}

/**
 * Alerjen ızgarası + besin künyesi — **iki tipin ortak gövdesi**.
 *
 * Bunlar metin tablosuna KONMUYOR ve sebebi brief'in kendi kuralı: *"her alanı eşit ağırlıkta
 * gösteren bir tablo gözü kalabalıkta gezdirir"*. Alerjen bir metin değil kapalı kümedir ve
 * kararı da başka bir şekilde verilir — okunacak şey yazılanlar değil, **yazılmayanlar**.
 */
function DeclarationBlocks({
  fields,
}: {
  fields: { allergens?: readonly ProductAllergen[]; traces?: readonly ProductAllergen[]; nutrition?: unknown };
}) {
  const nutrition = (fields.nutrition ?? null) as Nutrition | null;
  return (
    <>
      {fields.allergens ? <AllergenGrid title="Alerjenler" selected={fields.allergens} /> : null}
      {fields.traces ? <AllergenGrid title="İzler (çapraz bulaşma)" selected={fields.traces} /> : null}
      {nutrition ? <NutritionTable nutrition={nutrition} /> : null}
    </>
  );
}

/**
 * **On dört AB alerjeninin TAMAMI** — işaretlenmeyenler de görünür (brief ③).
 *
 * Gerekçe kaynak denetimi değil: *en tehlikeli hata fazladan alerjen değil, EKSİK alerjendir* ve
 * yalnız seçilenleri gösteren bir liste tam da onu görünmez kılar. Patron ürünü tanıyor — "fındık
 * işaretlenmemiş" diyebilmesi için fındığın orada, işaretsiz durması yeter.
 *
 * İşaretsizler SÖNÜK ama okunur: silik gri, üstü çizili değil. Üstünü çizmek "yok" iddiası olurdu;
 * oysa söylenen şey "asistan işaretlemedi" — ikisi ayrı şey.
 */
function AllergenGrid({ title, selected }: { title: string; selected: readonly ProductAllergen[] }) {
  const marked = new Set(selected);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
        {title} · {marked.size > 0 ? `${num(marked.size)} işaretli` : 'hiçbiri işaretlenmedi'}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {ProductAllergenEnum.options.map((code) => (
          <span
            key={code}
            className={`rounded-ops-btn border px-2 py-1 font-ops-body text-ops-xs ${
              marked.has(code)
                ? 'border-ops-amber-line bg-ops-amber-bg font-semibold text-ops-amber-dark'
                : 'border-ops-line bg-ops-subtle text-ops-faint'
            }`}
          >
            {resolveLocalizedText(ALLERGEN_LABELS[code], OPERATIONS_LOCALE)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Besin künyesi (100 g başına) — **aranan şey ambalajla aynılık değil, künyenin KENDİ İÇİNDE
 * tutarlılığı** (brief ④).
 *
 * İki tuhaflık işaretleniyor ve ikisi de ölçülebilir: ① boş bırakılmış kalem (o satır beyanı eksik
 * bırakır) ② toplamı 100 g'ı aşan makro dağılım (yağ + karbonhidrat + protein + tuz) — fizikî
 * olarak imkânsız, yani okuma hatası. "Sıfır enerji" ayrıca işaretlenmiyor: 0 kcal bir içecekte
 * meşru olabilir ve her makul değeri uyarıya çevirmek uyarıyı değersizleştirir.
 */
/**
 * Besin kalemi biçimi — **ondalık ancak varsa**. Sabit bir basamak sayısı iki yönde de yanlış
 * olurdu: `digits=0` "16,4 g yağ"ı 16'ya yuvarlar (beyanı değiştirmek), `digits=1` ise enerjiyi
 * "1.650,0 kJ" diye yazar (ambalajda olmayan bir hassasiyet iddiası).
 */
function gram(value: number | null): string {
  if (value === null) return '—';
  return num(value, Number.isInteger(value) ? 0 : 1);
}

function NutritionTable({ nutrition }: { nutrition: Nutrition }) {
  const macros = (['fatG', 'carbohydrateG', 'proteinG', 'saltG'] as const).map((k) => nutrition[k] ?? 0);
  const macroSum = macros.reduce((a, b) => a + b, 0);
  const missing = NUTRITION_KEYS.filter((k) => nutrition[k] === null);

  // Enerji TEK satır: aynı büyüklüğün iki birimi (kJ · kcal), ayrı kalem değil.
  const rows = [
    {
      key: 'energy',
      label: 'Enerji',
      value: [
        nutrition.energyKj === null ? null : `${gram(nutrition.energyKj)} kJ`,
        nutrition.energyKcal === null ? null : `${gram(nutrition.energyKcal)} kcal`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    ...NUTRITION_KEYS.filter((k) => k !== 'energyKj' && k !== 'energyKcal').map((k) => ({
      key: k,
      label: NUTRITION_LABELS[k].label,
      value: nutrition[k] === null ? '' : `${gram(nutrition[k])} ${NUTRITION_LABELS[k].unit}`,
    })),
  ].map((r) => ({ ...r, value: r.value || '— boş' }));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
        Besin künyesi · 100 g başına
      </span>
      <PreviewTable
        columns={[
          { key: 'kalem', header: 'Kalem', width: '1fr', cell: (r) => r.label },
          // 200px: enerji satırı iki birimi birlikte taşıyor ("1.650 kJ · 394 kcal") ve dar sütunda
          // kesiliyordu — kesilen bir sayı, yanlış bir sayıdır.
          { key: 'deger', header: 'Değer', width: '200px', align: 'right', mono: true, cell: (r) => r.value },
        ]}
        rows={rows}
        rowKey={(r) => r.key}
      />
      {macroSum > 100 ? (
        <PreviewNotice tone="red" title="Künye kendi içinde tutarsız">
          Yağ + karbonhidrat + protein + tuz toplamı {num(Math.round(macroSum))} g — 100 g'ı aşıyor, yani bu
          değerlerden biri yanlış okunmuş. Onaylamadan önce ambalaja bakın.
        </PreviewNotice>
      ) : null}
      {missing.length > 0 ? (
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {num(missing.length)} kalem boş bırakıldı — beyan bu hâliyle eksik sayılır.
        </span>
      ) : null}
    </div>
  );
}

/** Önizleme tablosunun bir satırı — bugünkü hâl ↔ yazılacak hâl. */
interface DeclarationRow {
  key: string;
  label: string;
  current: string;
  next: string;
  /** Alan bugün DOLU ve üzerine yazılıyor — uyarı bu bayraktan çıkar. */
  overwrites: boolean;
}

/**
 * Beyan alanlarının ÇOK DİLLİ METİN olanlarını tabloya çevirir (ad · açıklama · içindekiler ·
 * saklama). Alerjen · iz · besin künyesi burada YOK: onlar dilden bağımsız ve kararı da başka
 * şekilde veriliyor — kendi bloklarında çiziliyorlar (`DeclarationBlocks` künyesi).
 */
function declarationRows(
  fields: Record<string, unknown>,
  current: ProductDraftPayload['currentFields'],
): DeclarationRow[] {
  return Object.entries(fields).flatMap(([key, value]) => {
    const nextText = localizedSummary(value);
    if (!nextText) return [];
    const before = (current as Record<string, unknown> | undefined)?.[key];
    const currentText = current === undefined ? '?' : localizedSummary(before) || '—';
    return [
      {
        key,
        label: DECLARATION_FIELD_LABEL[key] ?? key,
        current: currentText,
        next: nextText,
        // Eski hâl BİLİNMİYORSA üzerine yazma İDDİA EDİLMEZ: '?' bir değer değil, bilgisizliktir.
        overwrites: current !== undefined && currentText !== '—',
      },
    ];
  });
}

/** Çok dilli metnin tek hücrelik özeti; metin değilse ya da boşsa `''` (satır hiç çizilmez). */
function localizedSummary(value: unknown): string {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as Record<string, unknown>;
  if (!('tr' in record || 'fr' in record || 'de' in record)) return '';
  // Boş dizge ile yokluk AYNI şey: yazılıp silinmiş bir dil ("") "dolduruldu" görünmemeli.
  return (['tr', 'fr', 'de'] as const)
    .flatMap((l) => {
      const text = typeof record[l] === 'string' ? (record[l] as string).trim() : '';
      return text ? [`${l.toUpperCase()}: ${text}`] : [];
    })
    .join(' · ');
}

/**
 * Asistanın **emin olmadığı** alanlar (22.6'nın ikinci karar girdisi).
 *
 * ── TAMLIK BURADA YAZILMIYOR, VE BU BİLİNÇLİ ────────────────────────────────
 * Bir tur burada da "onaylasanız da şu beyanlar eksik kalacak" kutusu vardı; ölçünce aynı cümlenin
 * kartın "Uygulanınca ne olur" bölümünde zaten kurulduğu görüldü (`kind-meta.impactFor`, tamlık
 * ölçütü motordan). İki kutu aynı şeyi söylüyordu — ve her yerde uyaran bir ekran hiçbir yerde
 * uyarmamış olur. Tek kaynak künyede kaldı; ekran onu yeniden hesaplamıyor.
 *
 * Belirsizlik ise künyenin söylemediği şey: hangi alanı net okuyamadığı modelin kendi beyanı ve
 * ekranın gözü oraya yönlendirmesi bütün alanları tek tek okutmaktan değerli — patron ürünü zaten
 * biliyor, ona "şuraya bak" demek yeter.
 */
function UncertainNotice({ uncertain }: { uncertain: readonly string[] }) {
  if (uncertain.length === 0) return null;
  return (
    <PreviewNotice tone="red" title="Asistan bu alanlardan emin değil">
      {uncertain.map((f) => DECLARATION_FIELD_LABEL[f] ?? f).join(' · ')} — ambalajdan net okunamadı. Onaylamadan
      önce bu alanları gözden geçirin.
    </PreviewNotice>
  );
}

/**
 * Vitrin işareti — **çizimde YOK**, sözleşmenin tarif ettiği desen (§2a): tek satırlık
 * "öncesi → sonrası", Bölge önizlemesindeki künye satırı deseniyle.
 *
 * `name` payload'da saklı ve bu bilinçli (`FeaturedFlagPayloadSchema` künyesi): kayıt sonradan
 * yeniden adlandırılırsa geçmişte "neyi onaylamıştım" sorusunun cevabı o günkü ad olmalı.
 */
function FeaturedFlagPreview({ payload }: { payload: FeaturedFlagPayload }) {
  const TARGET: Record<FeaturedFlagPayload['target'], string> = {
    category: 'Kategori',
    collection: 'Koleksiyon',
    bundle: 'Paket',
  };
  /**
   * **Izgara doluluğu — kararın ikinci girdisi** (22.5 · denetim taraması 09.08).
   *
   * "Vitrine ekle" tek başına karar edilemiyordu: vitrin bir liste değil SEÇKİdir ve doluysa
   * eklenen ötekini aşağı iter. Sayı önerinin kurulduğu andaki hâldir — uygulama anında değişmiş
   * olabilir, o yüzden bir kural değil karar girdisidir ve cümlesi de öyle kuruluyor.
   *
   * Sayı gelmediyse SATIR HİÇ ÇİZİLMEZ: "0 kayıt vitrinde" demek, ölçülemeyen değeri sıfıra
   * düşürmek olurdu (`CLAUDE §1`) ve boş bir ızgara varmış gibi okunurdu.
   */
  const current = payload.currentlyFeaturedCount;
  const slots = FEATURED_SLOTS[payload.target];
  const targetLabel = TARGET[payload.target].toLowerCase();

  return (
    <PreviewBody note="katalog · vitrin işareti">
      <FactRow facts={[{ label: TARGET[payload.target], value: payload.name }]} />
      <div className="flex items-center gap-3 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3 font-ops-display text-ops-base font-semibold">
        <span className="text-ops-muted">{payload.isFeatured ? 'Vitrinde değil' : 'Vitrinde'}</span>
        <span className="text-ops-faint">→</span>
        <span className={payload.isFeatured ? 'text-ops-olive-dark' : 'text-ops-body'}>
          {payload.isFeatured ? 'Vitrinde' : 'Vitrinde değil'}
        </span>
      </div>
      {/* Izgaranın bugünkü doluluğu — "bir tane daha eklemek" ile "sekizinciyi eklemek" arasındaki
          farkı gösteren tek satır. Ekleme yönünde ve ızgara zaten doluysa amber: yeni kayıt
          görünecek ama sıradaki biri aşağı düşecek. */}
      {current !== undefined ? (
        <span
          className={`font-ops-body text-ops-xs ${
            payload.isFeatured && current >= slots ? 'font-semibold text-ops-amber-dark' : 'text-ops-muted'
          }`}
        >
          Vitrinde şu an {num(current)} {targetLabel} var, ızgarada {num(slots)} yer görünüyor.
          {payload.isFeatured && current >= slots
            ? ' Izgara dolu — bu kayıt eklenirse sıradaki biri ana sayfada görünmez olur.'
            : ''}
        </span>
      ) : null}

      {/* Vitrin YAYIN DEĞİLDİR (isFeatured ≠ isActive): işaret yalnız anasayfadaki seçkiyi değiştirir,
          kaydı satışa açmaz/kapatmaz. İkisi bir kez karıştırılırsa pasif bir kayıt vitrine alınabilir. */}
      <span className="font-ops-body text-ops-xs text-ops-muted">
        Vitrin işareti yayın durumu değildir — kayıt satışta değilse vitrine alınsa da müşteriye görünmez.
      </span>
    </PreviewBody>
  );
}

/**
 * Tedarik siparişi — **çizimde YOK**, sözleşmenin tarif ettiği desen (§2a): Stok tablosunun
 * deseni (Ürün · Boy · Adet), üstünde tedarikçi satırı.
 *
 * Hedef depo künyede YOK ve uydurulmuyor: payload deponun yalnız kimliğini taşıyor
 * (`PurchaseOrderPayloadSchema.warehouseId`), okunur kodunu değil — stok girişinin payload'ı ise
 * `warehouseCode`'u da taşıyor. Uuid yazmak operatöre hiçbir şey söylemez.
 * Kayıt `BEKLEYEN(22.13)`te: payload'a `warehouseCode` eklenirse künye depoyu adıyla yazar.
 */
function PurchaseOrderPreview({ payload }: { payload: PurchaseOrderPayload }) {
  const lines = payload.lines.map((line) => ({ ...line, ...splitVariantName(line.productName) }));
  return (
    <PreviewBody note="tedarik · sipariş taslağı">
      <FactRow facts={[{ label: 'Tedarikçi', value: payload.supplierName ?? 'seçilmedi' }]} />

      <PreviewTable
        columns={[
          { key: 'ad', header: 'Ürün', width: '1fr', cell: (l) => l.name },
          { key: 'boy', header: 'Boy', width: '96px', cell: (l) => l.size ?? '—' },
          { key: 'adet', header: 'Adet', width: '62px', align: 'right', mono: true, cell: (l) => num(l.qty) },
        ]}
        rows={lines}
        rowKey={(l) => l.variantId}
      />

      {payload.note ? <span className="font-ops-body text-ops-sm text-ops-body">{payload.note}</span> : null}
    </PreviewBody>
  );
}

/**
 * Tarif taslağı — üç dilin DOLULUĞU + malzeme bağları.
 *
 * Yayın kuralı veride: üç dil dolmadan tarif yayınlanamaz (`DOMAIN §13`). Önizlemenin en yararlı
 * bilgisi bu yüzden metnin kendisi değil, hangi dilin eksik olduğu — onaylayan kişi tarifin
 * bugün yayına giremeyeceğini bilerek onaylıyor.
 */
function RecipeDraftPreview({ payload }: { payload: RecipeDraftPayload }) {
  const LANGS = [
    { key: 'tr' as const, label: 'TR' },
    { key: 'fr' as const, label: 'FR' },
    { key: 'de' as const, label: 'DE' },
  ];
  const filled = (lang: 'tr' | 'fr' | 'de') => Boolean(payload.name[lang]?.trim() && payload.steps[lang]?.trim());
  const missing = LANGS.filter((l) => !filled(l.key));
  const lines = payload.items.map((item) => ({ ...item, ...splitVariantName(item.productName) }));

  return (
    <PreviewBody note="tarif · taslak">
      <div className="flex flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">
          {resolveLocalizedText(payload.name, OPERATIONS_LOCALE)}
        </span>
        {/* Süre · porsiyon · öğün TEK satırda: üçü de tarif formunun kutusu ve üçü de kısa metin.
            Doldurulmayan BOŞ GEÇİLMEZ, "yazılmadı" diye yazılır — verilmemiş bir kararı gizlemek,
            onu verilmiş gibi gösterir (22.10 ilkesi). */}
        <span className="font-ops-body text-ops-sm text-ops-body">
          {[
            payload.duration ? resolveLocalizedText(payload.duration, OPERATIONS_LOCALE) : 'süre yazılmadı',
            payload.serves ? resolveLocalizedText(payload.serves, OPERATIONS_LOCALE) : 'porsiyon yazılmadı',
            payload.meal ? resolveLocalizedText(payload.meal, OPERATIONS_LOCALE) : 'öğün yazılmadı',
          ].join(' · ')}
        </span>
        {/* Evden gerekenler: bizden alınmayan malzeme (tuz, su, zeytinyağı). Satılabilir bir satır
            değil ama tarif onsuz yapılamaz — onaylayan bunu görmeli. */}
        <span className="font-ops-body text-ops-xs text-ops-muted">
          Evinizden: {payload.pantry ? resolveLocalizedText(payload.pantry, OPERATIONS_LOCALE) : 'yazılmadı'}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {LANGS.map((l) => (
            <span
              key={l.key}
              className={[
                'rounded-ops-card border px-2 py-0.5 font-ops-display text-ops-micro font-semibold',
                filled(l.key)
                  ? 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
                  : 'border-ops-line-strong bg-ops-gray-100 text-ops-muted',
              ].join(' ')}
            >
              {l.label} {filled(l.key) ? 'dolu' : 'eksik'}
            </span>
          ))}
        </span>
      </div>

      <PreviewTable
        columns={[
          { key: 'ad', header: 'Malzeme', width: '1fr', cell: (l) => l.name },
          { key: 'boy', header: 'Boy', width: '96px', cell: (l) => l.size ?? '—' },
          { key: 'adet', header: 'Adet', width: '62px', align: 'right', mono: true, cell: (l) => num(l.qty) },
        ]}
        rows={lines}
        rowKey={(l, i) => `${l.variantId}-${i}`}
      />

      {missing.length > 0 ? (
        <PreviewNotice tone="amber" title="Yayına alınamaz">
          {missing.map((l) => l.label).join(' ve ')} dili eksik — tarif taslakta kalır. Eksik dil tarif
          ekranından tamamlanır.
        </PreviewNotice>
      ) : null}
    </PreviewBody>
  );
}

// ── Dağıtıcı ─────────────────────────────────────────────────────────────────

/**
 * Ham `payload` → tipin önizlemesi.
 *
 * **Şekil burada bir kez DOĞRULANIR** (`safeParse`), `as` ile kesilmez. Okuma kapısı zaten
 * doğrulanmış veri veriyor; buradaki denetim ona güvensizlikten değil, güvenin bir gün yanlış
 * çıkma ihtimalinden: kesilseydi bozuk bir dilekçe ekranı beyaza düşürürdü — onay kuyruğunun
 * yapabileceği en kötü şey. Doğrulama düşerse kart yaşar, önizleme yerine sebebini söyler ve
 * operatör "Teknik döküm"den ham JSON'a bakabilir.
 */
export function ProposalPreview({
  kind,
  payload,
  economics = null,
}: {
  kind: AssistantProposalKind;
  payload: unknown;
  /**
   * Kâr künyesi — okuma kapısından hazır gelir (`lib/assistant/economics`), ekran hesaplamaz.
   *
   * `null` üç şey demek olabilir ve üçü de aynı davranışı gerektirir (blok çizilmez): bu tipte
   * kârlılık kavramı yok · hesaplanamadı · satır eski. Ekran hesabı kendi yapsaydı aynı sayı iki
   * yerde çıkar ve bir gün ayrışırdı — ayrışan sayı burada "kâr" diye okunur.
   */
  economics?: ProposalEconomics | null;
}) {
  const schema = (PROPOSAL_PAYLOAD_SCHEMAS as Partial<Record<AssistantProposalKind, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>>)[kind];
  const parsed = schema?.safeParse(payload);

  if (!parsed?.success) {
    return (
      <PreviewBody note="önizleme çizilemedi">
        <PreviewNotice tone="red" title="Dilekçenin şekli tanınmadı">
          Bu öneri beklenen şekilde değil, bu yüzden ne olacağını gösteremiyorum. Onaylamayın — aşağıdaki teknik
          dökümden ham dilekçeye bakıp öneriyi reddedin ve asistandan yeniden isteyin.
        </PreviewNotice>
      </PreviewBody>
    );
  }

  const data = parsed.data;
  switch (kind) {
    case 'bundle_draft':
      return (
        <BundlePreview
          payload={data as BundleDraftPayload}
          economics={economics?.kind === 'bundle' ? economics : null}
        />
      );
    case 'stock_intake':
      return <StockIntakePreview payload={data as StockIntakePayload} />;
    case 'money_movement':
      return <MoneyPreview payload={data as MoneyMovementPayload} />;
    case 'zone_extend':
      return <ZonePreview payload={data as ZoneExtendPayload} />;
    case 'product_draft':
      return <ProductDraftPreview payload={data as ProductDraftPayload} />;
    case 'featured_flag':
      return <FeaturedFlagPreview payload={data as FeaturedFlagPayload} />;
    case 'purchase_order':
      return <PurchaseOrderPreview payload={data as PurchaseOrderPayload} />;
    // `batch_offer` burada YOK ve boşluğu bilinçli (22.8): o tipin kararı artık kuyruğun içinde,
    // kendi form gövdesiyle veriliyor (`bodies/batch-offer-body`). Önizlemesi de silindi — ikisi
    // birden dursaydı aynı fiyat iki yerde iki farklı hâlde okunurdu (biri asistanın önerdiği,
    // öteki operatörün yazdığı). Karar verilmiş satırda gövde çizilmez ama form da gerekmez:
    // kartın künyesi (özet · tutar · "ne olacaktı") olan biteni zaten söylüyor.
    // `discount_draft` de burada YOK, aynı gerekçeyle (22.10): kural artık kuyruğun içinde GERÇEK
    // indirim formuyla kuruluyor (`bodies/discount-draft-body` → `prices/discount-form`). Önizleme
    // korunsaydı aynı kampanya iki dilde anlatılırdı ve forma bir alan eklendiğinde önizleme bunu
    // bilmez, öneri ekranı sessizce eksik gösterirdi — talebin birinci amacı bu ikiliği bitirmekti.
    case 'recipe_draft':
      return <RecipeDraftPreview payload={data as RecipeDraftPayload} />;
    case 'product_create':
      return <ProductCreatePreview payload={data as ProductCreatePayload} />;
    default:
      // **Bugün buraya HİÇBİR tip düşmüyor** — on bir tipin on biri çizili. Dal yine de duruyor
      // çünkü enum bir gün yeni bir tip kazanacak ve o gün panel beyaza düşmemeli.
      //
      // Cümle bunu dosdoğru söylüyor: bir tur önce burada "uygulanamıyor, reddedin" yazıyordu ve o
      // cümle yeni tipler eklendiği an YALAN oldu — öneri pekâlâ uygulanabiliyordu. Onay ekranının
      // söyleyebileceği en kötü şey, doğru olmayan bir şey.
      return (
        <PreviewBody note="önizleme çizilmedi">
          <PreviewNotice tone="amber" title="Bu tipin önizlemesi henüz yok">
            Öneri uygulanabilir, ama ne olacağını burada gösteremiyorum. Karar vermeden önce aşağıdaki
            teknik dökümden ham dilekçeye bakın.
          </PreviewNotice>
        </PreviewBody>
      );
  }
}
