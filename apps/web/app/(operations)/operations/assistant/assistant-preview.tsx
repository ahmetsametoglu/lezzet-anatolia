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
import { STORAGE_TYPE_OPTIONS } from '@/components/operation/form/product-form';
import { AlertIcon } from '@/components/operation/ui/icons';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { money, num, percent, shortDate } from '@/components/operation/ui/format';
import { DECLARATION_FIELD_LABEL, splitVariantName } from './assistant-labels';

/**
 * Önizleme — kuyruk kartının tipe göre değişen tek bölümü; ham JSON yerine işlemin sonucunu gösterir (müşterinin göreceği kart,
 * parti tablosu, muhasebe satırı), çünkü anlamı okunmayan onay okunmadan verilir. Çerçeve her tipte aynı, JSON "Teknik döküm"de.
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
 * Önizlemenin mini tablosu — `ui/table` değil, çünkü o kaydırma, iskelet ve sonsuz kaydırma taşıyan bir ekran tablosu;
 * burada kartın içine gömülü, daima dolu bir özet var ve `flex-1` tablo kartı büyütürdü.
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
          {/* Hücre sarar, kırpmaz: yarısı "…" olan cümle operatöre onaylayacağı metni göstermez.
              Sayı ve tarih sütunları tek satırda kalır, sarmaları hizayı bozar. */}
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
 * Kâr satırı — zarar bilinçli verilebilecek bir karar olduğu için rozet değil cümle, `offer-dialog`la aynı dilde: tutarıyla söyle,
 * yolu kapatma. Maliyet bilinmiyorsa hesap yapılmaz, çünkü sıfır sayılsa ikna edici bir "%100 kâr" çıkardı.
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
 * Paket taslağı — müşterinin göreceği kart + kalem tablosu + mutabakat rozeti; fiyatlar euro geldiği için (`BundleDraftPayloadSchema`)
 * gösterime `toCents` ile girer. Rozet motorun kuralının aynasıdır: paylar paket fiyatını tutmuyorsa `applyProposal` reddeder,
 * operatör bunu onaydan önce görmeli.
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
        {/* Görsel yok: asistan görsel yüklemez, paket pasif doğar; boş çerçeve "görsel yüklenemedi" diye okunurdu. */}
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

      {/* Kârlılık mutabakat rozetiyle aynı ağırlıkta: paylar tutup paket yine zararına olabilir. */}
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
 * Stok girişi — parti tablosu; kırmızı yalnız tarihi geçmiş ya da bugün dolan partidir, çünkü yakın-SKT kararı kalan raf ömrü
 * yüzdesiyle verilir (`domain-core/stock/shelf-life.ts`) ve payload toplam raf ömrünü taşımaz (kayıt `BEKLEYEN(22.13)`te).
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
          // Belge tarihi verilmediyse kabul bugüne yazılır ve bu söylenir: fatura genelde dünküdür, sessiz varsayım onaylanmaz.
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
    // "Tür" satırı yönden gelir (Gider ↔ Tahsilat); iç tip yazılmaz, sözlüğü Para ekranınındır. Transfer üçüncü hâldir:
    // para şirketten çıkmaz, hesap değiştirir; "Gider" demek onu kaybedilmiş para gibi okuturdu.
    {
      k: 'Tür',
      v: payload.counterAccountName ? 'Transfer' : incoming ? 'Tahsilat' : 'Gider',
      className: payload.counterAccountName ? 'text-ops-ink' : incoming ? 'text-ops-olive-dark' : 'text-ops-red',
    },
    // Paranın gittiği hesap kararın YARISI: "Kasa → ?" diye bir transfer onaylanamaz.
    ...(payload.counterAccountName ? [{ k: 'Hedef hesap', v: payload.counterAccountName }] : []),
    ...(payload.nature ? [{ k: 'Tür', v: payload.nature }] : []),
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
 * Bölge genişletme — posta kodu tablosu + turuncu geri alınamaz kutusu: kod bölgeye girince haber bekleyenlere bildirim gider
 * ve bölge kapatılsa bile geri alınamaz. Bekleyen yoksa cümle de küçülür, çünkü geri alınamayan bir şey kalmaz.
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
 * Ürün taslağı — alan bazında fark tablosu (üç dil yan yana) ve üzerine yazma uyarısı: `updateDetails` sürüm tutmadığı için
 * dolu alan onaylandığı an kaybolur. Eski hâl (`currentFields`) yoksa "okunamadı" denir, "boştu" varsayılmaz.
 */
function ProductDraftPreview({ payload }: { payload: ProductDraftPayload }) {
  const rows = declarationRows(payload.fields, payload.currentFields);
  const kunye = identityRows(payload);
  const boylar = sizeRows(payload);
  const currentKnown = payload.currentFields !== undefined;

  // Ezilen alanların adları (sayısı değil): operatör neyi kaybettiğini sorar. Alerjen ve besin künyesi tabloda değil
  // kendi bloklarında çizilir ama üzerine yazılıyorsa uyarı onları da sayar; boş alerjen listesi de bir beyandır.
  const overwritten = [
    ...rows.flatMap((r) => (r.overwrites ? [r.label] : [])),
    ...kunye.flatMap((r) => (r.overwrites ? [r.label] : [])),
    ...(currentKnown && payload.fields.allergens && payload.currentFields?.allergens != null ? [DECLARATION_FIELD_LABEL.allergens!] : []),
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

      {/* Künye ve boy AYRI tablolarda: ikisinin de dili yok, beyan tablosunun "TR/FR/DE" hücresine girselerdi
          okunmaz olurlardı. Boy satırı hangi boyun neyi alacağını söyler — kimlik değil ad yazılır. */}
      {kunye.length > 0 ? (
        <PreviewTable
          columns={[
            { key: 'alan', header: 'Künye', width: '118px', cell: (r) => r.label },
            { key: 'now', header: 'Bugün', width: '1fr', cell: (r) => r.current },
            { key: 'next', header: 'Yazılacak', width: '1fr', cell: (r) => r.next },
          ]}
          rows={kunye}
          rowKey={(r) => r.key}
        />
      ) : null}

      {boylar.length > 0 ? (
        <PreviewTable
          columns={[
            { key: 'boy', header: 'Boy', width: '118px', cell: (r) => r.boy },
            { key: 'yaz', header: 'Yazılacak', width: '1fr', cell: (r) => r.next },
          ]}
          rows={boylar}
          rowKey={(r) => r.key}
        />
      ) : null}

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
 * Yeni ürün — ambalajdan; tamamlama önizlemesiyle aynı gövdeyi paylaşır (`DeclarationBlocks`, `UncertainNotice`), çünkü ikisi de
 * "sisteme ne yazılıyor" sorusunu cevaplar. Fiyat, stok ve görsel ayrı birer karar olduğu için burada yer tutucuları bile yok.
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
          // Oran yüzdedir, kesir değil (`product.vat_rate` veride 5,5); ondalık şart, çünkü Fransa'nın gıda oranı %5,5
          // ve yuvarlanınca var olmayan bir %6 görünürdü.
          { label: 'KDV', value: percent(payload.vatRate, 1) },
          // Kargolanabilirlik okunamadıysa öyle yazılır: "Hayır" ile "bilinmiyor" arasındaki fark,
          // donmuş ürünün kargoya çıkıp çıkmamasıdır.
          {
            label: 'Kargo',
            value: payload.shippable === null ? 'okunmadı — varsayılan: gönderilebilir' : payload.shippable ? 'Gönderilebilir' : 'Gönderilemez',
          },
          // Boy satırı etiketi ve ölçüyü birlikte okur: etiket müşterinin gördüğü, ölçü kilo başı fiyatın ve kargo hesabının tabanı.
          {
            label: 'Boylar',
            value: payload.variants
              .map((v) => {
                // Ambalaj ölçüsü de künyeye girer ki operatör asistanın tahmin etmediğini görsün; hiç ölçü yoksa "ölçü yok" yazar.
                const dims =
                  v.packedLengthMm && v.packedWidthMm && v.packedHeightMm
                    ? `${num(v.packedLengthMm)}×${num(v.packedWidthMm)}×${num(v.packedHeightMm)} mm`
                    : null;
                const size = [
                  v.netQuantity ? `${num(v.netQuantity)} ${v.netUnit ?? 'g'}` : null,
                  v.piecesCount ? `${num(v.piecesCount)} ${PORTION_SHORT[v.portionKind ?? 'item']}` : null,
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

      {/* Emniyet bir uyarı değil rahatlama: kayıt aday doğar; kutuya konsa riskle aynı ağırlıkta okunurdu. */}
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
 * Alerjen ızgarası + besin künyesi — iki tipin ortak gövdesi; metin tablosuna konmaz, çünkü alerjen kapalı bir kümedir
 * ve okunacak şey yazılanlar değil yazılmayanlardır.
 */
function DeclarationBlocks({
  fields,
}: {
  fields: { allergens?: readonly ProductAllergen[] | null; traces?: readonly ProductAllergen[]; nutrition?: unknown };
}) {
  const nutrition = (fields.nutrition ?? null) as Nutrition | null;
  return (
    <>
      {fields.allergens ? <AllergenGrid title="Alerjenler" selected={fields.allergens} emptyLabel="alerjen içermez" /> : null}
      {fields.traces ? <AllergenGrid title="İzler (çapraz bulaşma)" selected={fields.traces} emptyLabel="hiçbiri işaretlenmedi" /> : null}
      {nutrition ? <NutritionTable nutrition={nutrition} /> : null}
    </>
  );
}

/**
 * On dört AB alerjeninin tamamı görünür, işaretlenmeyenler de: en tehlikeli hata eksik alerjendir ve yalnız seçilenleri
 * gösteren liste onu görünmez kılar. İşaretsizler sönük ama üstü çizili değil; boş listenin anlamını başlık söyler
 * (alerjende "içermez" beyanı, izde "işaretlenmedi").
 */
function AllergenGrid({ title, selected, emptyLabel }: { title: string; selected: readonly ProductAllergen[]; emptyLabel: string }) {
  const marked = new Set(selected);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
        {title} · {marked.size > 0 ? `${num(marked.size)} işaretli` : emptyLabel}
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
 * Besin kalemi biçimi — ondalık ancak varsa: sabit basamak ya "16,4 g"ı yuvarlayıp beyanı değiştirir
 * ya da enerjiye ",0 kJ" ekleyip ambalajda olmayan bir hassasiyet iddia ederdi.
 */
function gram(value: number | null): string {
  if (value === null) return '—';
  return num(value, Number.isInteger(value) ? 0 : 1);
}

/**
 * Besin künyesi (100 g başına) — aranan şey ambalajla aynılık değil, künyenin kendi içinde tutarlılığı: boş kalem ve toplamı
 * 100 g'ı aşan makro dağılım işaretlenir. Sıfır enerji işaretlenmez, 0 kcal bir içecekte meşrudur.
 */
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
          // 200px: enerji satırı iki birimi birlikte taşır; dar sütunda kesilen sayı yanlış sayıdır.
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
 * Beyanın çok dilli metin alanlarını tabloya çevirir (ad, açıklama, içindekiler, saklama); alerjen, iz ve besin künyesi dilden
 * bağımsız olduğu için kendi bloklarında çizilir (`DeclarationBlocks`).
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

/**
 * Künye değerinin okunur hâli — kapalı kümeler kendi sözlüğünden, kategori ADIYLA (uuid ekrana yazılmaz).
 * `undefined` "eski hâl okunamadı", `null` "boştu" demektir ve ikisi ayrı cevaptır.
 */
function identityText(key: string, value: unknown, categoryName?: string | null): string {
  if (value === undefined) return '?';
  if (value === null) return '—';
  if (key === 'categoryId') return categoryName ?? 'kategori atanmış';
  if (key === 'shippable') return value ? 'açık' : 'kapalı';
  if (key === 'storageType') return STORAGE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? String(value);
  if (key === 'shelfLifeDays') return `${String(value)} gün`;
  return String(value);
}

/** Künye satırları — beyandan ayrı çizilir çünkü dili yok; ölçüt aynı: dolu bir değerin üzerine yazmak geri alınamaz. */
function identityRows(payload: ProductDraftPayload): DeclarationRow[] {
  const current = payload.currentIdentity as Record<string, unknown> | undefined;
  return Object.entries(payload.identity).flatMap(([key, value]) => {
    if (key === 'categoryName' || value === undefined) return [];
    const before = identityText(key, current === undefined ? undefined : current[key], payload.currentIdentity?.categoryName);
    return [
      {
        key,
        label: DECLARATION_FIELD_LABEL[key] ?? key,
        current: before,
        next: identityText(key, value, payload.identity.categoryName),
        overwrites: before !== '?' && before !== '—',
      },
    ];
  });
}

/** Boy satırının hangi alanının yazılacağı — ölçü birimleri adın içinde, çünkü "200" tek başına gram mı adet mi demez. */
const SIZE_FIELD_LABEL: Record<string, string> = {
  barcode: 'barkod',
  label: 'etiket',
  netQuantity: 'net miktar',
  netUnit: 'birim',
  piecesCount: 'adet',
  portionKind: 'porsiyon türü',
};

/** Porsiyon türünün KISA hâli — kartta yer dar, tam kelime satırı taşırıyor. */
const PORTION_SHORT: Record<string, string> = {
  item: 'ad.',
  slice: 'dilim',
  package: 'paket',
  packedWeightG: 'kargo ağırlığı (g)',
  packedLengthMm: 'uzunluk (mm)',
  packedWidthMm: 'genişlik (mm)',
  packedHeightMm: 'yükseklik (mm)',
};

/** Boy alanının okunur değeri — etiket çok dilli, barkod kendi türünü söyler ("koli ×12"), kalanı sayı. */
function sizeValueText(key: string, value: unknown): string {
  if (key === 'label') return localizedSummary(value);
  if (key === 'barcode') {
    const code = value as { code: string; kind: string; qtyPerCode: number };
    return `${code.code} (${code.kind === 'case' ? `koli ×${code.qtyPerCode}` : 'paket'})`;
  }
  return String(value);
}

/**
 * Boy satırları — okunur ad dilekçede taşınır (`variantLabel`), kimlik ekrana çıkmaz.
 *
 * Kimliksiz satır YENİ boydur ve adının yanında öyle yazar: var olanın boş kutusunu doldurmak ile ürüne boy
 * eklemek ayrı kararlardır ve ikincisi ürünün satış listesine bir satır daha koyar.
 */
function sizeRows(payload: ProductDraftPayload): { key: string; boy: string; next: string }[] {
  return payload.variants.map((variant, index) => ({
    key: variant.variantId ?? `yeni-${index}`,
    boy: variant.variantId ? variant.variantLabel : `${variant.variantLabel} · yeni boy`,
    next: Object.entries(variant)
      .filter(([key, value]) => key !== 'variantId' && key !== 'variantLabel' && value !== undefined)
      .map(([key, value]) => `${SIZE_FIELD_LABEL[key] ?? key}: ${sizeValueText(key, value)}`)
      .join(' · '),
  }));
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
 * Asistanın emin olmadığı alanlar — gözü oraya yönlendirmek bütün alanları tek tek okutmaktan değerli.
 * Tamlık burada yazılmaz: kartın "Uygulanınca ne olur" bölümü (`kind-meta.impactFor`) onu motordan zaten söylüyor.
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
 * Vitrin işareti — tek satırlık "öncesi → sonrası" (sözleşme §2a); `name` payload'da saklıdır ki kayıt sonradan
 * yeniden adlandırılsa da geçmişte neyin onaylandığı o günkü adla okunsun.
 */
function FeaturedFlagPreview({ payload }: { payload: FeaturedFlagPayload }) {
  const TARGET: Record<FeaturedFlagPayload['target'], string> = {
    category: 'Kategori',
    collection: 'Koleksiyon',
    bundle: 'Paket',
  };
  // Izgara doluluğu kararın ikinci girdisi: vitrin bir seçkidir ve doluysa eklenen ötekini aşağı iter; sayı önerinin
  // kurulduğu andaki hâldir. Sayı gelmediyse satır çizilmez, "0 kayıt" ölçülemeyeni sıfıra düşürürdü.
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
      {/* Ekleme yönünde ve ızgara doluysa amber: yeni kayıt görünecek ama sıradaki biri aşağı düşecek. */}
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

      {/* Vitrin yayın değildir: işaret yalnız anasayfa seçkisini değiştirir, kaydı satışa açıp kapatmaz. */}
      <span className="font-ops-body text-ops-xs text-ops-muted">
        Vitrin işareti yayın durumu değildir — kayıt satışta değilse vitrine alınsa da müşteriye görünmez.
      </span>
    </PreviewBody>
  );
}

/**
 * Tedarik siparişi — stok tablosunun deseni (Ürün · Boy · Adet), üstünde tedarikçi satırı; hedef depo yazılmaz, çünkü payload
 * yalnız kimliğini taşır ve uuid operatöre bir şey söylemez (kayıt `BEKLEYEN(22.13)`te).
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
 * Tarif taslağı — üç dilin doluluğu + malzeme bağları; üç dil dolmadan tarif yayınlanamadığı için (DOMAIN §13) önizlemenin
 * en yararlı bilgisi hangi dilin eksik olduğudur.
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
        {/* Doldurulmayan boş geçilmez, "yazılmadı" diye yazılır: verilmemiş kararı gizlemek onu verilmiş gibi gösterir. */}
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
 * Ham `payload` → tipin önizlemesi; şekil burada `safeParse` ile doğrulanır, `as` ile kesilmez: bozuk bir dilekçe ekranı
 * beyaza düşürmesin, kart yaşasın ve sebebini söylesin (ham JSON "Teknik döküm"de).
 */
export function ProposalPreview({
  kind,
  payload,
  economics = null,
}: {
  kind: AssistantProposalKind;
  payload: unknown;
  /**
   * Kâr künyesi — okuma kapısından hazır gelir (`lib/assistant/economics`), ekran hesaplamaz ki aynı sayı iki yerde ayrışmasın.
   * `null` (kavram yok, hesaplanamadı ya da satır eski) üçünde de blok çizilmez.
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
    // `batch_offer` ve `discount_draft` burada yok: o tiplerin kararı kuyruğun içinde kendi form gövdeleriyle verilir
    // (`bodies/batch-offer-body`, `bodies/discount-draft-body`); önizleme de dursa aynı karar iki hâlde okunurdu.
    case 'recipe_draft':
      return <RecipeDraftPreview payload={data as RecipeDraftPayload} />;
    case 'product_create':
      return <ProductCreatePreview payload={data as ProductCreatePayload} />;
    default:
      // Bugün buraya hiçbir tip düşmez; dal, enum yeni bir tip kazandığında panel beyaza düşmesin diye durur.
      // Cümle öneriyi uygulanamaz ilan etmez, yalnız önizlemenin çizilmediğini söyler.
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
