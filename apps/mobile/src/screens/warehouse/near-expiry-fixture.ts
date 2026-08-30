/*
  D3 · YAKIN-SKT TURU — FIXTURE (v2:1027-1032 birebir).

  ── NEDEN FIXTURE, VE NE ZAMAN GİDECEK ──────────────────────────────────────
  Bu listenin BESLENECEĞİ kapı bugün YOK ve bu ölçülmüş bir gerçek, bir eksiklik tahmini değil:
  yakın-SKT okumasının tek adresi `apps/web/lib/stock/batch-view.ts` ve o dosya `server-only` —
  `apps/mobile-api` onu import EDEMEZ. Terfisi kendi görevinde duruyor: **06.13** (`batch-view`
  okuma kapısının `@lezzet/application`a terfisi — mobil D3'ün ön şartı). O gün bu dosya silinir,
  yerine uçtan gelen liste geçer ve ekranın geri kalanı (satır düzeni, karar rozeti, D4 bağı)
  değişmez — o yüzden ekran bugün de TAM yazıldı (`notifications-fixture.ts` ile aynı karar).

  ── EKRAN SALT OKUNURDUR, VE BU TASARIMIN KARARI ────────────────────────────
  v2'nin kendi cümlesi: *"bu liste fiziksel ayıklama rehberidir; işaretleme yok."* Karar sistemce
  türetilir (eşikler: %25 yakın-SKT · %30 öneri indirimi), depocu onu değiştirmez. Tek eylem D4'e
  geçiştir ve o da tasarımın çizdiği yol: *"'İmha edilmeli' → Sayım/Düzeltme."*

  ── KİMLİKLER GERÇEK DEĞİL, VE EKRAN BUNU SAKLAMAZ ──────────────────────────
  Satırların `stockId`i uydurma bir UUID: D4'e geçildiğinde istek GERÇEK kapıya gider ve kapı
  `not_found` döner — ekran o reddi AYNEN gösterir. Sahte bir başarı göstermek (ya da D4'ün yazma
  yolunu kapatmak) iki ayrı yalan olurdu; 06.13 terfisiyle aynı ekran gerçek partilere bağlanır.
*/

/** Kararın tonu — v2:1028-1031'in renk üçlüleri; renk ADI değil, ANLAM taşınır (token ekranda çözülür). */
type NearExpiryDecision = 'offer_open' | 'offer_candidate' | 'discard' | 'none';

/** Kalan gün metninin tonu: geçmiş/çok yakın kırmızı, yakın terracotta, uzak nötr. */
type NearExpiryUrgency = 'expired' | 'soon' | 'calm';

interface NearExpiryBatch {
  /** Gerçek kapıda partinin kimliği olacak; bugün D4'e taşınan uydurma değer. */
  stockId: string;
  /** Parti kodu — kâğıt etiketle eşleşen künye. */
  code: string;
  /** Ürün + boy, operasyon dilinde. */
  name: string;
  qty: number;
  /** "2 gün" · "−1 gün (geçti)" — gün SAYISI değil, tasarımın yazdığı cümle (kapı gelene dek). */
  daysLabel: string;
  urgency: NearExpiryUrgency;
  /**
   * Kalan ömür YÜZDESİ, 0–100. **`null` = ölçülemedi** (raf ömrü bilinmiyor) ve sıfır DEĞİLDİR
   * (CLAUDE §1): "%0" yazmak o partiyi hemen imhalık gösterirdi.
   *
   * Metin DEĞİL SAYI tutuluyor (30.08): v3 bu değeri hem çubukla hem yazıyla gösteriyor ve ikisi
   * tek kaynaktan çıkmalı — "kalan ömür %18" dizesi ile 18 sayısını yan yana tutmak, birinin bir
   * gün ötekiyle çelişmesi demekti. Cümleyi sözlük kuruyor.
   */
  lifePercent: number | null;
  decision: NearExpiryDecision;
}

export const NEAR_EXPIRY_FIXTURE: NearExpiryBatch[] = [
  {
    stockId: '00000000-0000-4000-8000-000000000301',
    code: 'P-0698',
    name: 'Su Böreği · tepsi',
    qty: 6,
    daysLabel: '2 gün',
    urgency: 'soon',
    lifePercent: 18,
    decision: 'offer_open',
  },
  {
    stockId: '00000000-0000-4000-8000-000000000302',
    code: 'P-0641',
    name: 'Kaymaklı Baklava · 1 kg',
    qty: 4,
    daysLabel: '−1 gün (geçti)',
    urgency: 'expired',
    lifePercent: 0,
    decision: 'discard',
  },
  {
    stockId: '00000000-0000-4000-8000-000000000303',
    code: 'P-0705',
    name: 'Şöbiyet · 500 g',
    qty: 9,
    daysLabel: '5 gün',
    urgency: 'calm',
    lifePercent: 23,
    decision: 'offer_candidate',
  },
  {
    stockId: '00000000-0000-4000-8000-000000000304',
    code: 'P-0688',
    name: 'Acılı Ezme · 250 g',
    qty: 12,
    daysLabel: '9 gün',
    urgency: 'calm',
    // Toplam ömrü bilinmeyen üründe yüzde HESAPLANMAZ; "%0" yazmak bozuk bir ölçümü sağlıklı gibi
    // okuturdu (CLAUDE §1) ve o parti hemen imhalık görünürdü.
    lifePercent: null,
    decision: 'none',
  },
];

/**
 * D4'e taşınacak parti — tasarımın çizdiği yol *"'İmha edilmeli' → Sayım/Düzeltme"*.
 * İmhalık yoksa `null`: D4 konusuz açılır ve bunu söyler (uydurma bir parti seçmek yerine).
 */
export function discardCandidate(batches: readonly NearExpiryBatch[]): NearExpiryBatch | null {
  return batches.find((batch) => batch.decision === 'discard') ?? null;
}
