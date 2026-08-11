import type { ProductFormFields } from './types';

// Ürün formu — BEYAN sekmesi (INCO yasal beyan). Ayrı sekmede olmasının sebebi hacim: dört alan daha
// aynı kolona eklenirse operatör her ürün için baştan sona kaydıran bir duvarla karşılaşır.
//
// Yerleşim mantığı: SOLDA uzun metinler (içindekiler, saklama) — vurgu düğmesi ve önizlemesiyle
// birlikte yer isterler; SAĞDA kapalı listeler ve tablo (alerjen çipleri, çapraz bulaşma, besin
// değerleri).

export function ProductFormDeclaration({ fields }: { fields: ProductFormFields }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-7">
      <div className="flex flex-col gap-6">{fields.declarationTexts}</div>
      <div className="flex flex-col gap-5 border-l border-ops-line pl-7">
        {fields.allergens}
        {fields.traces}
        {fields.nutrition}
      </div>
    </div>
  );
}
