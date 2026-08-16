import type { ProductFormFields } from './types';

// Ürün formu — masaüstü sunumu (operasyon web'i masaüstü-yalnız).
//   ANA ALAN (sol): üst [görsel (geniş) | içerik: ad · açıklama · kategori · (tarih | raf)] +
//     ALTINDA Varyantlar (tam genişlik).
//   SAĞ RAIL (dar): tek küme — Kargo · Satışta · Otomatik fiyat · KDV · Hedef marj · Alerjenler; akış
//     sırasında ve DOĞAL yükseklikte (Alerjenler marjın hemen altında, rail'in dibine YASLANMAZ).
//     Toggle kartları sabit (ToggleField'de flex-none) → rail gerilse bile boş alana yayılıp UZAMAZLAR.
// Yalnız yerleştirir — alan elemanları kapta (product-form-dialog) kurulur, burada tekrarlanmaz.

export function ProductFormDesktop({ fields }: { fields: ProductFormFields }) {
  // Görsel bloğu KOŞULLU DEĞİL (11.08). Bir tur `fields.image === null` ise 360 px'lik sütun
  // çizilmiyordu — kuyruk galeri slotunu boş veriyordu diye. Kullanıcı bunu kırpma saydı ve slot
  // kuyruğa da geldi: *"o formu bire bir kopyala."* İki yüzeyde tek düzen, dallanma yok.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_250px]">
      {/* Ana alan — içerik üstte, varyantlar altta */}
      <div className="flex flex-col pr-7">
        {/* Üst: görsel | içerik */}
        <div className="grid grid-cols-[360px_minmax(0,1fr)]">
          <div className="pr-6">{fields.image}</div>
          <div className="flex flex-col gap-5 border-l border-ops-line pl-7">
            {fields.category}
            {/* Çok dilli içerik (ad + açıklama) tek dil kartında — dil sekmesi kartın başlığında */}
            {fields.content}
            <div className="grid grid-cols-2 gap-2.5">
              {fields.dateType}
              {fields.shelfLife}
            </div>
          </div>
        </div>

        {/* Varyantlar — görsel + içerik altında, tam genişlik */}
        <div className="mt-8 border-t border-ops-line pt-6">{fields.variants}</div>
      </div>

      {/* Sağ rail — dar; tek akış, auto-height → komponentler uzamaz.
          Alerjenler BURADAN ÇIKTI: yasal beyan alanlarıyla birlikte "Beyan" sekmesinde toplandı (05.10),
          çünkü alerjen listesi içindekiler metniyle birlikte doldurulur — ikisi ayrı sekmede olursa
          operatör vurguladığı alerjeni çipe eklemeyi unutur. */}
      <div className="flex flex-col gap-4 border-l border-ops-line pl-7">
        {fields.shippable}
        {fields.storage}
        {fields.autoPrice}
        {fields.vat}
        {fields.margin}
      </div>
    </div>
  );
}
