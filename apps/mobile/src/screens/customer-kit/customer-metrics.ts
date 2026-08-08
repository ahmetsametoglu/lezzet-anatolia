/*
  MÜŞTERİ EKRANLARININ ÖLÇÜ TAMAMLAYICISI — v3'te ölçülmüş, paylaşılan ölçü katmanında
  (`src/theme/metrics.ts`) HENÜZ OLMAYAN duraklar.

  NEDEN AYRI DOSYA: `theme/` bu etapta YAZIYA KAPALI (21.14 kısıtı — operasyon ekranları paralel
  çalışıyor). Ama bu değerlerin komponent dosyalarına ham piksel olarak dağılması ölçü katmanının
  kendi kuralını (tek yerde durur) bozardı: bir kart yüksekliği üç ekranda üç kez yazılırsa bir
  gün üçü ayrışır. O yüzden ham değerler DAĞILMADI, sadece İKİNCİ BİR TEK YERE konuldu.

  BU DOSYA GEÇİCİDİR: `theme/metrics.ts` yazıya açıldığı gün buradaki duraklar oraya taşınır ve
  dosya silinir. Ad çakışması bilerek yok — buradaki hiçbir ad `appMetrics` içinde geçmiyor.
  Terfi ihtiyacı raporlandı.

  YUVARLAMA: ölçü katmanının kendi kuralı burada da geçerli — YAPISAL ölçüler (kart yüksekliği,
  daire çapı) yuvarlanMAZ; onları yuvarlamak tasarımın hizasını bozar.
*/

export const customerMetrics = {
  /** Yüzen sepet düğmesi (v3:1303 — 58×58). */
  fab: 58,

  /**
   * Koleksiyon bandı ve üstünden taşan daire (v3:105, 111 — 132 yükseklik · 148 daire).
   * Daire banttan 16 dp yüksektir; taşma tasarımın imzasıdır, bant kırpmaz.
   */
  collectionBand: 132,
  collectionPhoto: 148,

  /** Tarif kartı (v3:136 — 220×280) ve hazır paket kartının fotoğraf yüksekliği (v3:151 — 172). */
  recipeCardWidth: 220,
  recipeCardHeight: 280,
  packageCardHeight: 172,

  /** Günün fırsatı bandındaki daire fotoğraf (v3:85 — 132). */
  flashPhoto: 132,

  /** Fırsat kartındaki küçük daire (v3:93 — 48). */
  offerPhoto: 48,

  /** Sipariş detayındaki canlı takip haritası (v3:702 — 195). */
  mapHeight: 195,

  /** Tek kullanımlık kod alanı — rakamlar için özellikle yüksek (v3:781 — 62). */
  codeFieldHeight: 62,

  /** Onay ekranlarının büyük ✓ dairesi (v3:614 — 92) ve ödeme ekranındaki küçüğü (v3:604 — 64). */
  confirmMark: 92,
  paymentMark: 64,

  /** Kampanya iletişimi anahtarı (v3:882 — 50×30, topuz 24). */
  switchWidth: 50,
  switchHeight: 30,
  switchKnob: 24,
} as const;
