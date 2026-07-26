import type { ProductFormFields } from './product-form-types';

// Ürün formu — MASAÜSTÜ sunumu (Sapma 3).
//   ANA ALAN (sol): üst [görsel (geniş) | içerik: ad · açıklama · kategori · (tarih | raf)] +
//     ALTINDA Varyantlar (tam genişlik).
//   SAĞ RAIL (dar, boydan boya): üst küme (Kargo · Satışta · Otomatik fiyat · KDV · Hedef marj) DOĞAL
//     yükseklikte + EN ALTTA Alerjenler. Üst küme auto-height → içindeki toggle kartları (ToggleField'de
//     flex-1) rail'in boş dikey alanına yayılıp UZAMAZ.
// Yalnız yerleştirir — alan elemanları kapta (product-form-dialog) kurulur, burada tekrarlanmaz.

export function ProductFormDesktop({ fields }: { fields: ProductFormFields }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_250px]">
      {/* Ana alan — içerik üstte, varyantlar altta */}
      <div className="flex flex-col pr-7">
        {/* Üst: görsel | içerik */}
        <div className="grid grid-cols-[360px_minmax(0,1fr)]">
          <div className="pr-6">{fields.image}</div>
          <div className="flex flex-col gap-5 border-l border-ops-line pl-7">
            {fields.category}
            {fields.name}
            {fields.description}
            <div className="grid grid-cols-2 gap-2.5">
              {fields.dateType}
              {fields.shelfLife}
            </div>
          </div>
        </div>

        {/* Varyantlar — görsel + içerik altında, tam genişlik */}
        <div className="mt-8 border-t border-ops-line pt-6">{fields.variants}</div>
      </div>

      {/* Sağ rail — dar, boydan boya */}
      <div className="flex h-full flex-col border-l border-ops-line pl-7">
        {/* Üst küme: auto-height → komponentler uzamaz */}
        <div className="flex flex-col gap-4">
          {fields.shippable}
          {fields.isActive}
          {fields.autoPrice}
          {fields.vat}
          {fields.margin}
        </div>
        {/* Alerjenler — rail'in dibinde */}
        <div className="mt-auto">{fields.allergens}</div>
      </div>
    </div>
  );
}
