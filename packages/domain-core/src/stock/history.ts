/**
 * **STOK GEÇMİŞİNİN ÇIKARIMLARI** (22.30) — satılma hızı, yeterlilik, parti ömrü, fire oranı.
 *
 * Motor DB'yi bilmez: satırları çağıran okur, kararı burası verir. Hepsi saf aritmetik ama hiçbiri
 * "sadece bölme" değil — her birinin bir BİLİNMEZLİK hâli var ve asıl iş onu doğru işaretlemek.
 *
 * ── ÖLÇÜLEMEYEN DEĞER SIFIR DEĞİLDİR (`CLAUDE §1`) ──────────────────────────
 * Hiç satış görmemiş bir ürünün "günde 0 satıyor" diye okunması, stoğun sonsuza kadar yeteceğini
 * söyler; oysa doğru cümle *"bilmiyoruz"*dur. Bu dosyadaki her fonksiyon ölçemediğinde `null` döner
 * ve okuyan taraf bunu "—" diye çizer.
 */

/** Bir partiden çıkan mal — hazırlıkta yazılan gerçek (`order_item_batch`). */
export interface StockExit {
  stockId: string;
  qty: number;
  /** Siparişin anı (ISO). */
  at: string;
  /** Siparişin durumu — mal RAFTAN AYRILDI mı, yoksa hâlâ orada mı (aşağıdaki künye). */
  status: string;
}

/**
 * **MAL FİİLEN NE ZAMAN GİDER — hazırlıkta değil, TESLİMDE** (ölçüldü 14.08).
 *
 * `record_preparation` yalnız `order_item_batch` satırını yazar: hangi partiden ne alındığı
 * kaydedilir ama `physical_qty` DOKUNULMAZ ve rezervasyon durur. `deliver_order` ise stoğu düşürür
 * ve rezervasyonu siler. Yani hazırlanmış bir sipariş için mal AYNI ANDA üç yerde sayılır: çıkış
 * kaydında, fiili stokta ve rezervasyonda.
 *
 * Bu ayrım olmadan "giren − satılan − düşülen = elde" denklemi hazırlıktaki her sipariş için
 * hazırlanan miktar kadar TUTMAZ — ve ekran bunu bir veri arızası sanıp operatörü olmayan bir
 * hareketi aramaya gönderir (yaşandı: kullanıcı ekran görüntüsü, "denklem tutmuyor" uyarısı
 * hazırlanmış 8 adet yüzünden çıkıyordu).
 */
const DELIVERED_STATUSES = new Set(['delivered', 'completed', 'returned']);

/** Mal raftan AYRILDI mı — teslim edilmiş (ve sonrası) sayılır; hazırlanan hâlâ depodadır. */
export function hasLeftShelf(status: string): boolean {
  return DELIVERED_STATUSES.has(status);
}

/**
 * **İADE RESTOKU FİRE DEĞİLDİR ve denkleme GİRMEZ** (ölçüldü 15.08).
 *
 * Teslim sonrası iade `restock` ile geri alınınca iki şey birden olur (`0020_order_return`):
 * fiili stok artar (`return_restock` kaydı) **ve aynı adet `order_item_batch`ten düşülür**.
 * Migration bunu künyesinde şöyle diyor: *"`order_item_batch`'in anlamı bu kuralla keskinleşir:
 * bizden çıkıp GERİ GELMEYEN mal."*
 *
 * Yani `deliveredQty` zaten iadesi düşülmüş NET rakamdır. Restok kaydını bir de fire toplamına
 * katmak, aynı iadeyi İKİ KEZ saymak olur — ve denklem tam o kadar sapar (yaşandı: kullanıcı ekran
 * görüntüsü, `120 − 3 − (−1) = 118` ama elde 117; fark bire bir iadenin kendisiydi). Aynı sınıf hata
 * hazırlıkta da yaşanmıştı (`hasLeftShelf` künyesi): bir hareketin iki yerde sayılması.
 *
 * Kırılımda GÖRÜNMEYE devam eder — *"iade → stoğa döndü"* operatörün bilmesi gereken bir olaydır;
 * saklanan şey olay değil, onun fire toplamına katkısıdır.
 *
 * ── SAYIM FARKI DA AYRILDI (kullanıcı kararı 26.08) ─────────────────────────
 * `count_diff` bir tur fireye giriyordu ve ölçüm doğruydu — sayımda fazla çıkan mal net kaybı
 * gerçekten azaltır. Ama ekranda sonuç şuydu: **FİRE · %−2,1.** Hesap doğru, cümle yanlış; insan
 * "fire nasıl eksi olur" diye takılıyor ve sayıya güvenmiyor.
 *
 * Ayrım kavramsal: fire *"ne kadarını çöpe attım"*, sayım farkı *"saydığımda ne kadar saptım"*.
 * İkincisi iki yönlüdür ve bir ölçüm hatasının ya da kayıt boşluğunun izidir — imhayla aynı
 * toplamda durması ikisini de okunmaz yapıyordu. `count_diff` artık kırılımda GÖRÜNÜR ama kendi
 * satırında, ± işaretiyle; fire toplamı yalnız gerçek kayıpları sayar (imha · hasar · kayıp) ve
 * hep pozitiftir.
 */
export function countsAsLoss(reason: string): boolean {
  return reason !== 'return_restock' && reason !== 'count_diff';
}

/**
 * Sayım farkı mı — fire toplamından ayrı, kendi satırında gösterilen tek sebep.
 *
 * Ayrı bir yüklem, çünkü ekranın sorusu `countsAsLoss`un değili DEĞİL: `return_restock` de fire
 * sayılmaz ama o kırılımda "iade → stoğa döndü" diye kendi satırını zaten taşıyor. Sayım farkının
 * ayrı toplanması gerekiyor (± net sapma), iadenin ise gerekmiyor.
 */
export function isCountDiff(reason: string): boolean {
  return reason === 'count_diff';
}

/**
 * Ortalamanın anlamlı sayılması için gereken EN AZ parti sayısı.
 *
 * Tek partiden çıkan bir "ortalama ömür", ortalama değil o partinin kendisidir; ikinci bir örnek
 * olmadan sapmayı da göremeyiz. Eşik parametrik değil çünkü bir ayar değil, cümlenin doğru olma
 * koşulu: ekran zaten kaç örneğe dayandığını yazıyor.
 */
const MIN_LIFE_SAMPLE = 2;

/** Günde ortalama kaç adet çıktı — pencere GÜN cinsinden. Hiç çıkış yoksa `null` ("bilinmiyor"). */
export function dailyExitRate(exits: readonly StockExit[], windowDays: number): { qty: number; perDay: number } | null {
  if (windowDays <= 0) return null;
  const qty = exits.reduce((sum, exit) => sum + exit.qty, 0);
  // Sıfır çıkış "günde 0 satıyor" DEĞİL "hiç ölçemedik"tir: sıfır bir hız gibi kullanılırsa
  // yeterlilik sonsuza gider ve ürün "bol bol var" diye okunur.
  if (qty === 0) return null;
  return { qty, perDay: qty / windowDays };
}

/**
 * Eldeki mal kaç gün yeter — hız bilinmiyorsa `null`.
 *
 * Aşağı yuvarlanır: "3,8 gün yeter" cümlesi 4 güne yuvarlanırsa mal bitmeden sipariş verilmez.
 * Eksik tahmin geç kalmaktan iyidir.
 *
 * ── GÖZLEM PENCERESİNİN ÖTESİ TAHMİNDİR, ÖLÇÜM DEĞİL (ölçüldü 14.08) ────────
 * 90 günde 2 adet satan bir üründe 34 adet "1530 gün yeter" veriyor. Bölme doğru, cümle yanlış:
 * üç aylık bir gözlemden dört yıllık bir kesinlik iddia ediyor ve o sayıyı okuyan kişi onu bir ÖLÇÜM
 * sanır. Sonuç pencereyle SINIRLANIR ve sınırlandığı söylenir (`capped`) — "90+ gün" hem doğrudur
 * hem de neyi bilmediğimizi saklamaz.
 */
export function daysOfCover(
  availableQty: number,
  perDay: number | null,
  windowDays: number,
): { days: number; capped: boolean } | null {
  if (perDay === null || perDay <= 0) return null;
  const days = Math.floor(availableQty / perDay);
  return days > windowDays ? { days: windowDays, capped: true } : { days, capped: false };
}

/** Bir partinin ömrü — girişten SON çıkışa kaç gün. Hiç çıkış görmemişse `null`. */
export function batchLifeDays(createdAt: string, lastExitAt: string | null): number | null {
  if (!lastExitAt) return null;
  const days = (new Date(lastExitAt).getTime() - new Date(createdAt).getTime()) / 86_400_000;
  // Negatif olamaz ama saat farkları 0'ın altına düşürebilir; aynı gün tükenen parti "0 gün"dür.
  return Math.max(0, Math.round(days));
}

/**
 * **Tükenmiş partilerin ortalama ömrü** — yalnız GERÇEKTEN bitmiş partilerden.
 *
 * Elde duran parti örneğe girmez ve bu ayrım kritik: yarısı satılmış bir parti "yavaş eriyor"
 * demek değildir, daha bitmemiştir. Karıştırılırsa ortalama, yeni girmiş her partiyle uzar.
 *
 * `sampleCount` DÖNER ve ekranda yazılır: iki partiden çıkan ortalamayı sessizce "ortalama" diye
 * sunmak, olmayan bir kesinlik vaat etmektir.
 */
export function averageBatchLife(lifeDays: readonly number[]): { days: number; sampleCount: number } | null {
  if (lifeDays.length < MIN_LIFE_SAMPLE) return null;
  const total = lifeDays.reduce((sum, days) => sum + days, 0);
  return { days: Math.round(total / lifeDays.length), sampleCount: lifeDays.length };
}

/**
 * Fire oranı (%) — düşülen / giren. Hiç giriş yoksa `null` (payda yok, oran da yok).
 *
 * Pay İŞARETLİ toplamdır: stoğa geri alma (negatif düzeltme) fireyi azaltır — rapor NET kaybı
 * gösterir, şişmiş bir "imha ettik" rakamı değil (`StockAdjustmentService.reasonSummary` ile aynı
 * kural).
 */
export function lossPercent(lostQty: number, intakeQty: number): number | null {
  if (intakeQty <= 0) return null;
  return Math.round((lostQty / intakeQty) * 1000) / 10;
}
