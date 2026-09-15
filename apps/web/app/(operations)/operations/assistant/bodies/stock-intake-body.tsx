'use client';

import { suggestVatRegime } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import type { StockIntakePayload } from '@lezzet/types';
import { IntakeFormBody } from '@/components/operation/form/intake-form/body';
import { emptyIntakeLine, type IntakeFormValues } from '@/components/operation/form/intake-form/schema';
import { DocumentFileField } from '@/components/operation/form/document-form/file-field';
import { InvoiceFieldsBlock } from '@/components/operation/form/document-form/invoice-fields';
import { VAT_REGIME_LABEL } from '@/components/operation/form/document-form/labels';
import { invoiceBlock, type InvoiceFields } from '@/components/operation/form/document-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { money, num } from '@/components/operation/ui/format';
import { searchIntakeVariantsAction } from '@/lib/warehouse/intake-actions';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * MAL KABUL ÖNERİSİ — kuyruğun içinde, GERÇEK satırlarıyla (22.23).
 *
 * ── NEDEN KUYRUĞA GELDİ ─────────────────────────────────────────────────────
 * Tip `handoff`tı ve gerekçesi doğruydu: *"geri alınamaz — giren parti satılabilir olur ve SKT o an
 * sabitlenir; faturadan okunan miktar gözle doğrulanmadan yazılmamalı"*. O şart AYNEN duruyor —
 * doğrulama hâlâ karardan önce; değişen tek şey formun nerede DURDUĞU. Aynı gerekçe para tipinde de
 * vardı ve 22.18'de düştü: geri alınamazlık formun YERİNİ değil, VARLIĞINI şart koşuyor.
 *
 * Kullanıcının kurgusu (12.08): *"kullanıcı MCP ajanına ekran görüntüsü gönderip 'bu ürünlerin depo
 * kabulünü yaptık' der; birden fazla ürün olur; bunları düzenleyip kaydet deyip hepsinin depo
 * girişini yapar."* Fotoğrafı model okuyor, `propose_stock_intake` okunanı DOĞRULUYOR (varyant var
 * mı, depo kodu geçerli mi, her satırda tarih var mı) ve kalan tek adım buydu.
 *
 * ── ALIŞ FİYATI BURADA GÖRÜNÜR (kullanıcı kararı 12.08) ─────────────────────
 * Depo ekranı fiyatı görmez — sınır tipin kendisinde (`IntakeFormLine` fiyatsız). Kuyruk patronun
 * ekranıdır: fatura yanlış okunmuşsa maliyet onaydan ÖNCE düzeltilebilmeli, yoksa yanlış fiyat
 * sessizce yazılır ve "son alış fiyatı" onu öğrenir.
 *
 * ── FATURA DA BURADA (22.44 · 12.26 · kullanıcı kararı 14.09) ───────────────
 * Faturanın toplamı okunduysa fatura kabule bağlı bir BELGE olarak doğar ve tedarikçi borcu o belgeden
 * türer — kabulün satır toplamı KDV hariçtir, nakliyeyi ve iskontoyu bilmez. Toplam, KDV, rejim ve vade
 * formun altındaki blokta düzeltilir; dosya (MCP'den geçmeyen PDF) onay anında burada bırakılır.
 * Toplam boşsa belge YAZILMAZ ve kabul yine yapılır: faturası sonra gelen kabul meşrudur.
 */

/** Mal kabul önerisinin taslağı — satırlar, faturanın para künyesi ve onayda yüklenecek dosya (22.44). */
export interface IntakeDraft {
  intake: IntakeFormValues;
  invoice: InvoiceFields;
  file: File | null;
}

/** Asistanın okuduğu belge → formun açılış değerleri. */
export function intakeValuesFrom(payload: StockIntakePayload): IntakeDraft {
  return {
    intake: {
      warehouseId: payload.warehouseId,
      supplierId: payload.supplierId ?? '',
      documentNo: payload.documentNo ?? '',
      // Belgenin tarihi — asistan okuduysa o gün, okuyamadıysa boş ve kapı bugüne yazar. Uydurma bir
      // tarih koymuyoruz: kabulün günü stok yaşını ve dönem mutabakatını belirliyor.
      date: payload.date ?? '',
      lines: payload.lines.map((line) => ({
        // Tedarikçinin yazdığı ad başlıkta (22.43): patron "Druivenmelasse 650gr → Üzüm Pekmezi 650 g"
        // eşlemesini onaylamadan önce görsün — onay, eşlemenin de onayıdır.
        ...emptyIntakeLine(line.variantId, line.supplierItemName ? `${line.productName} · tedarikçide: ${line.supplierItemName}` : line.productName),
        qty: line.qty,
        expiryDate: line.expiryDate,
        lotNumber: line.lotNumber ?? '',
        // Dilekçe CENT taşıyor, form EURO — çevrim sınırda (`IntakeLineSchema` künyesi).
        unitCost: line.unitCostCents === null ? null : fromCents(line.unitCostCents),
      })),
    },
    invoice: {
      amount: payload.totalAmountCents === null ? null : fromCents(payload.totalAmountCents),
      vatAmount: payload.vatAmountCents === null ? null : fromCents(payload.vatAmountCents),
      vatRegime: payload.vatRegime,
      dueOn: payload.dueOn ?? '',
    },
    file: null,
  };
}

/**
 * Faturanın engeli — toplam boşsa fatura yok, engel de yok; doluysa belge kuralları geçerli ve tedarikçi
 * şart (kabulün faturası bir tedarikçinin belgesidir — kapı da `link_needs_supplier` ile reddeder).
 */
export function intakeInvoiceBlock(draft: IntakeDraft): string | null {
  // Dosya faturanın BELGESİNE bağlanır: toplam yoksa belge doğmaz ve seçilen dosya sessizce düşerdi.
  if (draft.invoice.amount === null) return draft.file ? 'Dosya faturanın belgesine bağlanır — faturanın toplamını girin ya da dosyayı kaldırın.' : null;
  if (!draft.intake.supplierId) return 'Faturayı belge olarak kaydetmek için tedarikçiyi seçin — ya da faturanın toplamını boşaltın.';
  return invoiceBlock(draft.invoice, draft.intake.date || new Date().toISOString().slice(0, 10));
}

interface StockIntakeBodyProps {
  payload: StockIntakePayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: IntakeDraft;
  onChange: (next: IntakeDraft) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function StockIntakeBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: StockIntakeBodyProps) {
  /**
   * RHF YOK ve bu bilinçli: satır editörü kontrollü bir liste (ekle/çıkar/hücre yaz) ve gerçeğin
   * sahibi zaten çerçeve. Ürün ve paket gövdelerinde RHF vardı çünkü oradaki formlar RHF ile
   * yazılmıştı; burada araya bir form kütüphanesi koymak, tek yaptığı şey aynı diziyi ileri geri
   * kopyalamak olurdu.
   */
  const supplier = options.suppliers.find((option) => option.id === values.intake.supplierId);
  const vatCents = values.invoice.vatAmount === null ? null : toCents(values.invoice.vatAmount);
  const suggested = supplier ? suggestVatRegime({ supplierCountry: supplier.country, vatAmountCents: vatCents }) : null;
  const locked = disabled || readOnly;

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[34rem] flex-[3] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <IntakeFormBody
          values={values.intake}
          onChange={(intake) => onChange({ ...values, intake })}
          onSearch={(term) => searchIntakeVariantsAction(term).then(({ data }) => data ?? [])}
          suppliers={options.suppliers}
          warehouses={options.warehouses}
          storageAreas={options.storageAreas}
          // Kuyruk patronun ekranı: fiyat görünür ve düzeltilebilir (yukarıdaki künye).
          showCost
          // Mutabakat FATURANIN hâliyle (22.44): toplam ve KDV bloktan — KDV biliniyorsa satırlar KDV
          // hariç tutarla karşılaştırılır, fark KDV'nin kendisi çıkmaz.
          documentTotalCents={values.invoice.amount === null ? null : toCents(values.invoice.amount)}
          documentVatCents={vatCents}
          disabled={locked}
        />

        <div className="flex flex-col gap-3 border-t border-ops-line-soft pt-3">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
            Fatura — kabule bağlı belge olarak kaydedilir
          </span>
          <InvoiceFieldsBlock
            value={values.invoice}
            onChange={(invoice) => onChange({ ...values, invoice })}
            suggestedRegime={suggested}
            amountLabel="Faturanın toplamı"
            amountRequired={false}
            disabled={locked}
          />
          {readOnly ? null : (
            <DocumentFileField
              file={values.file}
              onChange={(file) => onChange({ ...values, file })}
              label="Faturanın dosyası (isteğe bağlı)"
              disabled={disabled}
            />
          )}
        </div>
      </div>

      <ProposalAside subject={subject} fallbackTitle="Mal kabul" facts={factsOf(payload, values)} payload={payload} meta={meta} />
    </div>
  );
}

/** Dilekçenin öne çıkan sayıları — satır YALNIZ sapma varken çizilir (`ProposalAside` künyesi). */
function factsOf(payload: StockIntakePayload, values: IntakeDraft): ProposalFact[] {
  const counted = values.intake.lines.filter((line) => line.qty !== null && line.qty > 0);
  const proposedUnits = payload.lines.reduce((sum, line) => sum + line.qty, 0);
  const nowUnits = counted.reduce((sum, line) => sum + (line.qty ?? 0), 0);
  const mappingProposals = payload.lines.filter((line) => line.mappingProposed).length;
  const invoiceTotal = values.invoice.amount === null ? '—' : money(toCents(values.invoice.amount));
  return [
    { label: 'Kalem', value: String(payload.lines.length), now: String(counted.length) },
    { label: 'Toplam adet', value: num(proposedUnits), now: num(nowUnits) },
    // Eşleme önerisi (22.43) — türetilmiş künye, hep durur: onay bu kalemlerin tedarikçi eşlemesini de yazar.
    ...(mappingProposals > 0 ? [{ label: 'Eşleme önerisi', value: `${mappingProposals} kalem · onayda kaydedilir` }] : []),
    // Faturanın toplamı (22.44) — asistanın okuduğu ile formda duran; sapma varsa ikisi yan yana.
    ...(payload.totalAmountCents === null ? [] : [{ label: 'Fatura toplamı', value: money(payload.totalAmountCents), now: invoiceTotal }]),
    ...(payload.vatRegime === 'standard' && values.invoice.vatRegime === 'standard'
      ? []
      : [{ label: 'KDV rejimi', value: VAT_REGIME_LABEL[payload.vatRegime], now: VAT_REGIME_LABEL[values.invoice.vatRegime] }]),
  ];
}
