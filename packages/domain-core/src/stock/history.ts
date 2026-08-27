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

/**
 * Bir partiden çıkan mal — **hareket defterinin `out` satırı** (`stock_movement`, 06.14).
 *
 * ── BU ARAYÜZ BİR ZAMANLAR BİR TAHMİNDİ ─────────────────────────────────────
 * Eskiden kaynağı `order_item_batch`ti ve iki alanı taşımak zorundaydı: `status` (mal raftan
 * ayrıldı mı — çünkü o tablo hazırlıkta yazılıyor, stok ise teslimde düşüyordu) ve `at` olarak
 * SİPARİŞİN anı (çünkü tablonun kendi zaman damgası yoktu — sipariş bir gün önce verilip ertesi
 * hafta teslim edilirse bütün hız hesabı bir hafta kayıyordu).
 *
 * Defterde ikisi de gereksiz: satır yalnız mal FİİLEN çıkınca doğar ve kendi anını taşır.
 */
export interface StockExit {
  stockId: string;
  qty: number;
  /** Hareketin anı (ISO) — `stock_movement.occurred_at`. */
  at: string;
}

/**
 * **FİRE = yalnız imha** (`write_off`: DLC geçti · hasar · kayıp).
 *
 * ── BU YÜKLEM ESKİDEN BİR TELAFİYDİ, ARTIK BİR TANIM ────────────────────────
 * Girdisi `stock_adjustment.reason`dı ve iki değeri ELEMEK zorundaydı, çünkü o tablo birbirinden
 * farklı üç olayı tek enumda taşıyordu:
 *   · `return_restock` elenmeliydi — karşılığı `order_item_batch`ten zaten düşülmüştü, ikinci kez
 *     saymak aynı iadeyi iki kez saymaktı (yaşandı: `120 − 3 − (−1) = 118` ama elde 117).
 *   · `count_diff` elenmeliydi — iki yönlü olduğu için fire toplamını eksiye düşürüyordu ve ekranda
 *     **FİRE · %−2,1** yazıyordu; hesap doğru, cümle yanlıştı (kullanıcı kararı 26.08).
 *
 * Defterde bu üçü zaten üç ayrı `kind`. Yüklem artık bir şeyi elemiyor, bir şeyi TANIMLIYOR: fire
 * *"ne kadarını çöpe attım"* sorusudur ve cevabı tek tiptir.
 *
 * Ötekiler kırılımda GÖRÜNMEYE devam eder — *"iade → stoğa döndü"* operatörün bilmesi gereken bir
 * olaydır; saklanan şey olay değil, onun fire toplamına katkısıdır.
 */
export function countsAsLoss(kind: string): boolean {
  return kind === 'write_off';
}

/**
 * Sayım farkı mı — fire toplamından ayrı, kendi satırında gösterilen tip.
 *
 * Ayrı kalmasının sebebi kavramsal: fire *"ne kadarını çöpe attım"*, sayım farkı *"saydığımda ne
 * kadar saptım"*. İkincisi iki yönlüdür ve bir ölçüm hatasının ya da kayıt boşluğunun izidir;
 * imhayla aynı toplamda durması ikisini de okunmaz yapıyordu (22.34 · kullanıcı kararı 26.08).
 */
export function isCountDiff(kind: string): boolean {
  return kind === 'count_diff';
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
 * Fire oranı (%) — imha edilen / giren. Hiç giriş yoksa `null` (payda yok, oran da yok).
 *
 * Pay artık POZİTİFTİR ve tek tiptendir (`countsAsLoss` künyesi): defterde yön ayrı kolonda
 * durduğu için "negatif fire" diye bir hâl doğamıyor. Sayım farkı ve iade kendi satırlarında.
 */
export function lossPercent(lostQty: number, intakeQty: number): number | null {
  if (intakeQty <= 0) return null;
  return Math.round((lostQty / intakeQty) * 1000) / 10;
}
