/*
  Müşteri ekranlarının kitin ortak ölçü katmanında (`theme/metrics.ts`) bulunmayan tasarım ölçüleri; ekran dosyalarına ham
  piksel olarak dağılmasınlar diye tek yerde durur. Yapısal ölçüler (kart yüksekliği, daire çapı) yuvarlanmaz, çünkü
  yuvarlamak tasarımın hizasını bozar.
*/

export const customerMetrics = {
  /** Yüzen sepet düğmesi. */
  fab: 58,

  /** Koleksiyon bandı ve üstünden taşan daire; taşma tasarımın imzası olduğu için bant kırpmaz. */
  collectionBand: 132,
  collectionPhoto: 148,

  /** Tarif kartı ve hazır paket kartının fotoğraf yüksekliği. */
  recipeCardWidth: 220,
  recipeCardHeight: 280,
  packageCardHeight: 172,

  /** Vitrin raylarının sonundaki "tümünü gör" kartındaki ok dairesi. */
  railMoreArrow: 34,

  /** Tarifler listesindeki tam genişlik kart. */
  recipeListCardHeight: 168,
  /** Paketler listesindeki kartın fotoğraf bölgesi. */
  packageListPhotoHeight: 198,

  /** Günün fırsatı bandındaki daire fotoğraf. */
  flashPhoto: 132,

  /** Fırsat kartındaki küçük daire. */
  offerPhoto: 48,

  /** Ürün detayının kahraman fotoğrafı ve alt kenardan sarkan fiyat rozeti. */
  productHero: 400,
  productPriceDrop: 22,
  /** Aile (çeşit) çipindeki küçük daire. */
  productFamilyPhoto: 34,
  /** Yapışkan barın adet seçicisi (düğme ve değer sütunu) ve barın kaydırma payı. */
  productStepButtonWidth: 44,
  productStepButtonHeight: 48,
  productStepValueWidth: 30,
  productBarSpace: 108,
  /** Sepet FAB'ının yapışkan barın üstündeki konumu. */
  productFabBottom: 112,

  /* Tarif ve paket detayının ölçüleri burada, çünkü iskeletler de okuyor: ekran dosyasından içe aktarmak dairesel
     bağımlılık doğururdu. */
  /** Tarif kahramanı (ürününkünden bilerek basık) ve rozetin sarkması. */
  recipeHero: 300,
  recipeBadgeDrop: 18,
  /** Malzeme satırının daire fotoğrafı ve sepete ekleme kutusu. */
  recipeRowPhoto: 46,
  recipeAddBox: 38,
  /** Hazırlanış adımının numara dairesi ve barın kaydırma payı. */
  recipeStepBadge: 28,
  recipeBarSpace: 108,
  /** Paket içerik satırının küçük karesi. */
  packageItemPhoto: 46,
  /** Geri bildirim akışının oy aşaması: fotoğraf ve oy düğmesi (kitin `controlLg`sinden bilerek büyük); iskelet de okur. */
  feedbackPhoto: 380,
  feedbackVoteButton: 56,

  /** Sipariş detayındaki canlı takip haritası. */
  mapHeight: 195,

  /** Tek kullanımlık kod alanı — rakamlar için özellikle yüksek. */
  codeFieldHeight: 62,

  /** Karşılama ve künye tamamlama ekranlarının üstündeki logo; genişlik görselin oranından türer. */
  onboardingLogoHeight: 52,

  /** Onay ekranlarının büyük ✓ dairesi ve ödeme ekranındaki küçüğü. */
  confirmMark: 92,
  paymentMark: 64,

  /** Kampanya iletişimi anahtarı: gövde ve topuz. */
  switchWidth: 50,
  switchHeight: 30,
  switchKnob: 24,
} as const;
