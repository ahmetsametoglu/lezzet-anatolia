import type { ProductFormFields } from './types';

// Ürün formu — masaüstü yerleşimi. Alan elemanları kapta kurulur, burada yalnız yerleştirilir.
// Varyant tablosu ayrı satırda tam genişlik: sekiz kolon ve alt şeritleri sağ rayın yanına sığmıyordu.

export function ProductFormDesktop({ fields }: { fields: ProductFormFields }) {
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_250px]">
        {/* Görsel sütunu koşulsuz: asistan kuyruğu da ürün ekranı da aynı düzeni çizer. */}
        <div className="grid grid-cols-[360px_minmax(0,1fr)] pr-7">
          <div className="pr-6">{fields.image}</div>
          <div className="flex flex-col gap-5 border-l border-ops-line pl-7">
            {fields.category}
            {fields.content}
            <div className="grid grid-cols-2 gap-2.5">
              {fields.dateType}
              {fields.shelfLife}
            </div>
          </div>
        </div>

        {/* Kartlar doğal yükseklikte: ray, soldaki sütunun boyuna gerilmez. */}
        <div className="flex flex-col gap-4 border-l border-ops-line pl-7">
          {fields.shippable}
          {fields.storage}
          {fields.autoPrice}
          {fields.vat}
          {fields.margin}
        </div>
      </div>

      <div className="mt-8 border-t border-ops-line pt-6">{fields.variants}</div>
    </div>
  );
}
