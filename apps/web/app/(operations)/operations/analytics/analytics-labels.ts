import type { Channel } from '@lezzet/types';
import type { AnalyticsChannel, AnalyticsMode } from './analytics-url';

// Ekran sözlüğü. Tasarımın §6 kuralı burada zorlanıyor: **iç terim arayüze çıkmaz** — "funnel",
// "RFM", "kohort", "UTM", "AnalyticsEvent" yerine insan dili. Sözlüğün tek yerde durması bunu
// denetlenebilir kılıyor: yeni bir blok eklerken terimi buraya yazmak zorunda kalan kişi, ham
// terimi de burada görür.

/**
 * Sıfır-sonuç kovalarının adları.
 *
 * **Kapının kendi `zeroResultKindLabel`'ı KULLANILAMIYOR** ve sebebi bir sınır: `lib/analytics/read`
 * `server-only` ve bu dosyayı okuyan komponentler `'use client'`. Tipler silinerek geçiyor ama bir
 * DEĞER import etmek istemci paketine sunucu modülünü çekerdi. Sözlüğün ekranda durması zaten daha
 * doğru — etiket bir sunum kararıdır, okuma kapısının işi değil. (Kapıdaki kopya bugün hiçbir
 * yerden çağrılmıyor; arka uca bildirildi.)
 */
export const ZERO_RESULT_LABEL = {
  search: 'Aradı, bizde yok',
  filter: 'Süzgeç boş küme verdi',
} as const;

export const MODE_LABEL: Record<AnalyticsMode, string> = {
  ticaret: 'Ticaret',
  trafik: 'Trafik',
};

export const CHANNEL_LABEL: Record<AnalyticsChannel, string> = {
  all: 'Tüm kanallar',
  b2c: 'B2C',
  b2b: 'B2B',
};

/**
 * Çip SIRASI — `ChannelEnum.options` DEĞİL (`['b2b','b2c']`), çizimin sırası: B2C önce.
 *
 * Enum sırası bir veri kararıdır ve ekranı bağlamaz; burada sıra bir anlam taşıyor — B2C ana
 * kanaldır ve okuma soldan sağa "genelden özele" gider. Enum'a bırakılsaydı bir gün enum'a üçüncü
 * bir kanal eklendiğinde ekranın sırası da sessizce değişirdi.
 */
export const CHANNEL_ORDER = ['b2c', 'b2b'] as const satisfies readonly Channel[];

/** Servis süzgecine geçen kanal — `all` hiç geçilmez (süzgeç yok). */
export function toChannelFilter(channel: AnalyticsChannel): Channel | undefined {
  return channel === 'all' ? undefined : channel;
}

/**
 * Blokların "neden boş" cümleleri — TEK yerde, çünkü aynı sebep birden çok bloğu kapatıyor.
 *
 * Ayrım kasıtlı ve bu ekranın en önemli dürüstlüğü:
 * · `WARMING_*` → kapı var, veri birikiyor ("bekle")
 * · `ABSENT_*`  → bu sayı bugün hiç hesaplanmıyor ("bekleme")
 */
export const NOTES = {
  /** Olay defteri kurulu ama henüz hiçbir atıcı yazmıyor (08.9). */
  warmingLedger:
    'Gezinme ölçümünün defteri hazır, ama müşteri yüzeyindeki atıcılar henüz bağlanmadı — ilk ziyaretler kaydedilmeye başlayınca bu blok kendiliğinden dolar.',
  /** Veri var ama dönemde hiç satır yok. */
  warmingEmptyPeriod: 'Bu dönemde henüz kayıt yok. Birkaç gün veri birikince eğilim okunabilir hâle gelir.',
  /** Günlük özet bu boyutu hiç taşımıyor — ayrı bir okuma gerekiyor. */
  absentSourceDimension:
    'Günlük özet gün · olay · sayfa · depo · kanal · satılabilirlik boyutlarını taşıyor; kaynak (kampanya bağlantısı) oturum künyesinde yaşıyor ve henüz özete bağlanmadı.',
  absentSearchTerm:
    'Arama terimi özet satırında tutulmuyor (özet sayar, metni saklamaz). Sıfır-sonuç listesi ham defterden ayrı bir okumayla gelecek.',
  absentProductBreakdown:
    'Ürün kırılımı özet satırında yok. "Çok bakılıp az alınan" listesi ürün bazlı bir okuma istiyor — bakma ve sepete ekleme sayıları aynı üründe buluşmalı.',
  absentAcquisition:
    'Müşterinin bizi nereden bulduğu henüz kaydedilmiyor: alanın yazma kapısı var ama kampanya bağlantılarını yakalayan taraf yok. O bağ kurulunca kaynağa göre tekrar sipariş buradan okunur.',
  absentInsight: 'Özet anlatısı, üzerine konuşulacak kadar veri biriktiğinde yazılmaya başlar.',
  absentSegments:
    'İyi müşteriler / uyuyanlar / yeniler ayrımı siparişten türetilir ve o türetmenin kapısı henüz yok. Sipariş geçmişi birikince gruplar kendiliğinden oluşur — gezinme verisi beklemiyor.',
  absentOrderPeriod:
    'Dönem bazlı ciro/sipariş toplamı henüz okunmuyor — sipariş sayısında defter değil sipariş tablosu yetkili ve o okumanın kapısı ayrı.',
  absentVisitors:
    'Ziyaretçi ve oturum sayısı özet satırlarının toplanmasıyla bulunamaz: aynı oturum birden çok boyut satırına düşer, toplam gerçekten büyük çıkar. Tekil sayım ayrı bir okuma ister.',
} as const;

/**
 * Hero bandının KISA gerekçeleri. Uzun cümleler blok kutularında yaşar; hero dört ölçüyü yan yana
 * taşıyor ve orada üç satırlık bir açıklama sayının kendisini ezerdi (telefonda ekranın yarısı).
 *
 * Kısaltma bir bilgi kaybı DEĞİL: hero "neden yok"u tek nefeste söyler, blok gövdesi tam gerekçeyi
 * verir. İkisi aynı sözlükte durduğu için de ayrışamazlar.
 */
export const HERO_NOTES = {
  warmingLedger: 'Atıcılar bağlanınca dolar.',
  absentOrderPeriod: 'Dönem toplamının kapısı ayrı (sipariş tablosu yetkili).',
  absentVisitors: 'Tekil sayım özetten toplanamaz — ayrı okuma ister.',
  smallSample: (visits: number) => `Örneklem küçük (${visits} ziyaret) — oran henüz güvenilir değil.`,
} as const;

/**
 * Dönüşüm oranının GÜVENİLİRLİK eşiği — altında oran gösterilir ama "örneklem küçük" denir.
 *
 * **Gerekliliği ölçülerek görüldü (04.08):** defterde tek ziyaret ve tek sipariş varken hero
 * "%100,0 dönüşüm" yazıyordu. Sayı doğruydu, cümlesi yanlış — bir bakışta okunan bir gösterge
 * olarak "ziyaretçilerin tamamı sipariş verdi" diyordu. Analitikte en tehlikeli hata boş bir kutu
 * değil, **inandırıcı bir yanlıştır.**
 *
 * Değer PARAMETRİK ve kutsal değil: 30, "bir oranın yönü hakkında konuşmaya başlanabilecek" makul
 * bir alt sınır. Emsal ürün skorlarındaki `confident` eşiği (`feedback-labels`).
 */
export const CONVERSION_MIN_SAMPLE = 30;
