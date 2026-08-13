'use client';

import { fromCents } from '@lezzet/helper';
import type { StockIntakePayload } from '@lezzet/types';
import { IntakeFormBody } from '@/components/operation/form/intake-form/body';
import { emptyIntakeLine, type IntakeFormValues } from '@/components/operation/form/intake-form/schema';
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
 */

/** Asistanın okuduğu belge → formun açılış değerleri. */
export function intakeValuesFrom(payload: StockIntakePayload): IntakeFormValues {
  return {
    warehouseId: payload.warehouseId,
    supplierId: payload.supplierId ?? '',
    documentNo: payload.documentNo ?? '',
    // Belgenin tarihi — asistan okuduysa o gün, okuyamadıysa boş ve kapı bugüne yazar. Uydurma bir
    // tarih koymuyoruz: kabulün günü stok yaşını ve dönem mutabakatını belirliyor.
    date: payload.date ?? '',
    lines: payload.lines.map((line) => ({
      ...emptyIntakeLine(line.variantId, line.productName),
      qty: line.qty,
      expiryDate: line.expiryDate,
      lotNumber: line.lotNumber ?? '',
      // Dilekçe CENT taşıyor, form EURO — çevrim sınırda (`IntakeLineSchema` künyesi).
      unitCost: line.unitCostCents === null ? null : fromCents(line.unitCostCents),
    })),
  };
}

interface StockIntakeBodyProps {
  payload: StockIntakePayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: IntakeFormValues;
  onChange: (next: IntakeFormValues) => void;
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
  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[34rem] flex-[3] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <IntakeFormBody
          values={values}
          onChange={onChange}
          onSearch={(term) => searchIntakeVariantsAction(term).then(({ data }) => data ?? [])}
          suppliers={options.suppliers}
          warehouses={options.warehouses}
          // Kuyruk patronun ekranı: fiyat görünür ve düzeltilebilir (yukarıdaki künye).
          showCost
          documentTotalCents={payload.totalAmountCents}
          disabled={disabled || readOnly}
        />
      </div>

      <ProposalAside subject={subject} fallbackTitle="Mal kabul" facts={factsOf(payload, values)} payload={payload} meta={meta} />
    </div>
  );
}

/** Dilekçenin öne çıkan sayıları — satır YALNIZ sapma varken çizilir (`ProposalAside` künyesi). */
function factsOf(payload: StockIntakePayload, values: IntakeFormValues): ProposalFact[] {
  const counted = values.lines.filter((line) => line.qty !== null && line.qty > 0);
  const proposedUnits = payload.lines.reduce((sum, line) => sum + line.qty, 0);
  const nowUnits = counted.reduce((sum, line) => sum + (line.qty ?? 0), 0);
  return [
    { label: 'Kalem', value: String(payload.lines.length), now: String(counted.length) },
    { label: 'Toplam adet', value: num(proposedUnits), now: num(nowUnits) },
    // Belgenin kendi toplamı SAPMA GÖSTERMEZ — form onu değiştirmiyor; türetilmiş bir künye satırı
    // olarak hep duruyor ki mutabakat sayısı kararın yanında kalsın.
    ...(payload.totalAmountCents === null ? [] : [{ label: 'Belgede yazan', value: money(payload.totalAmountCents) }]),
  ];
}
