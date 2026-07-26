import { FormSection } from './form-section';
import type { ProductFormFields } from './product-form-dialog';

// Ürün formu — MOBİL sunumu (Sapma 3): tek sütun, alanlar alt alta (uygulama hissi). Görsel üstte
// (ortalanmış, ölçülü), sonra Temel → Açıklama → Yasal beyan → Varyantlar → Durum/fiyat. Yalnız
// yerleştirir — alan elemanları kapta (product-form-dialog) kurulur, burada tekrarlanmaz.

export function ProductFormMobile({ fields }: { fields: ProductFormFields }) {
  return (
    <div className="flex flex-col gap-7">
      <div className="mx-auto w-full max-w-[240px]">{fields.image}</div>

      <FormSection title="Temel">
        {fields.name}
        {fields.category}
        {fields.vat}
        {fields.dateType}
        {fields.shelfLife}
      </FormSection>

      <FormSection title="Açıklama">{fields.description}</FormSection>
      <FormSection title="Yasal beyan">{fields.allergens}</FormSection>

      {fields.variants}

      <FormSection title="Durum ve fiyatlandırma" className="gap-3">
        {fields.shippable}
        {fields.isActive}
        {fields.autoPrice}
        {fields.margin}
        {fields.priceNote}
      </FormSection>
    </div>
  );
}
