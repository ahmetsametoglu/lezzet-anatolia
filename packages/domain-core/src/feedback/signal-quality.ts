/**
 * Kaydırma sinyalinin kalitesi (17.3, 13.6) — DOMAIN §14 "ödül ≠ güven".
 *
 * **Müşteri katılımın ödülünü HER HÂLÜKÂRDA alır.** Kalite yalnız analizdeki ağırlığı etkiler.
 * Bu dosya o ayrımın kod karşılığı: puan hesabına hiç girmez (`points.ts`), yalnız aday panosunun
 * ve ürün skorunun "bu sinyale ne kadar güvenelim" sorusunu yanıtlar.
 *
 * Ölçüt üç sorudur:
 *   1. Karta bakıldı mı? (`dwell_ms`)
 *   2. Kişi ayırt ediyor mu, hep aynı yöne mi savuruyor?
 *   3. Kaç kaydırma yapılmış — az sayıda kaydırmada desen çıkarılamaz.
 */

/**
 * Bir kartın ciddiye alınabilmesi için asgari süre. **400 ms** — ürün adını okumaya ancak yeten,
 * "başparmakla savurmadan" ayıran eşik. Parametrik: gerçek kaydırma desenleri görüldükçe ayarlanır.
 */
export const MIN_DWELL_MS = 400;

/** Bu sürenin üstü "baktı, düşündü" sayılır; ağırlık burada tavanına ulaşır. */
export const FULL_DWELL_MS = 2000;

/** Desen çıkarmak için gereken asgari kaydırma sayısı — altında kişi "hep aynı" sayılamaz. */
export const MIN_SWIPES_FOR_PATTERN = 5;

/**
 * Tek bir kaydırmanın ağırlığı (0–1) — **yalnız süreye bakar.**
 *
 * `null` süre (ölçülememiş) 1 sayılır, 0 değil: veriyi ölçemediğimiz için müşteriyi cezalandırmak,
 * eski kayıtları ve ölçüm hatasını manipülasyonla aynı kefeye koymak olurdu.
 *
 * Eşiğin altı SIFIR, arası doğrusal: 400 ms'nin altında kart görülmemiştir.
 */
export function dwellWeight(dwellMs: number | null | undefined): number {
  if (dwellMs === null || dwellMs === undefined) return 1;
  if (dwellMs < MIN_DWELL_MS) return 0;
  if (dwellMs >= FULL_DWELL_MS) return 1;
  return (dwellMs - MIN_DWELL_MS) / (FULL_DWELL_MS - MIN_DWELL_MS);
}

/**
 * Kişinin genel güvenilirliği (0–1) — **ayırt ediyor mu?**
 *
 * Hep "beğendim" diyen de hep "geçtim" diyen de bilgi taşımaz: bir kişi her şeyi beğeniyorsa
 * hangi ürünü daha çok beğendiğini söyleyemez. Ölçü, azınlık yönün payıdır — %50/%50 tam güven,
 * %100/%0 sıfıra yakın.
 *
 * Az sayıda kaydırmada desen aranmaz (1 döner): üç kaydırmanın üçünü de beğenmiş olmak
 * şüphelenmek için sebep değildir.
 */
export function patternWeight(input: { likeCount: number; dislikeCount: number }): number {
  const total = input.likeCount + input.dislikeCount;
  if (total < MIN_SWIPES_FOR_PATTERN) return 1;

  const minority = Math.min(input.likeCount, input.dislikeCount);
  // Azınlık payı 0 → 0 ağırlık; 0.5 (tam denge) → 1 ağırlık.
  return Math.min(1, (minority / total) * 2);
}

/**
 * Bir kaydırmanın ANALİZDEKİ ağırlığı — süre × kişinin deseni.
 *
 * İkisi çarpılır çünkü ikisi de gerekli: uzun uzun bakıp hep aynı yöne savuran da, ayırt edip
 * milisaniyelerle geçen de tam güven vermez.
 */
export function swipeWeight(input: {
  dwellMs: number | null | undefined;
  swiperLikeCount: number;
  swiperDislikeCount: number;
}): number {
  return dwellWeight(input.dwellMs) * patternWeight({ likeCount: input.swiperLikeCount, dislikeCount: input.swiperDislikeCount });
}

/**
 * Aday ürünün **ağırlıklı** talep skoru ve güven göstergesi.
 *
 * Ham beğeni sayısı panoda yanıltıcıdır: 40 savurma beğenisi, 8 gerçek beğeniden büyük görünür.
 * `weightedLikes` bunu düzeltir; `trust` ise farkı ekrana taşır — tasarımın "sade bir güven
 * göstergesi" dediği şey (admin-geri-bildirim §2).
 */
export interface CandidateSignal {
  /** Ağırlıklandırılmış beğeni — sıralama bunu kullanır. */
  weightedLikes: number;
  /** Ham beğeni sayısı; ekran ikisini yan yana gösterebilir. */
  rawLikes: number;
  /** 0–1: ağırlıklının hama oranı. Düşükse "çok beğeni ama zayıf sinyal". */
  trust: number;
}

export interface CandidateSwipe {
  vote: 'like' | 'dislike';
  weight: number;
  /** Kaydıran kimlik; ziyaretçide `null` — o zaman tekilleştirilemez (bkz. aşağıdaki not). */
  swiperId: string | null;
  /** Kaydırma anı (ISO). Aynı kişinin aynı ürüne birden çok kaydırmasında EN YENİSİ geçerlidir. */
  at: string;
}

/**
 * Aynı kişinin aynı ürüne attığı fazla kaydırmalar TEKİLLEŞTİRİLİR — en yenisi kalır.
 *
 * **Neden burada ve neden silmeden:** pano "kaç kaydırma oldu"yu değil **"kaç kişi istiyor"u**
 * soruyor; bir kişinin aynı ürüne beş kez bakması beş kişilik talep değildir. Fazla satırları
 * VERİDEN silmek de doğru değil — geri bildirim geçmişi, kaydıranın desenini (`patternWeight`)
 * besleyen ham malzemedir ve o desen tam da istismarı yakalamak için var. Yani satır durur, panoda
 * bir kez sayılır.
 *
 * **En yenisi kazanır, en yükseği değil:** kişi fikrini değiştirmiş olabilir ("beğendim" → "geçtim").
 * En yüksek ağırlığı seçmek, kişinin son sözü yerine en emin göründüğü ânı almak olurdu.
 *
 * **Kimliksiz kaydırma tekilleştirilemez** ve bu bilinçli bir sınır: hangisinin aynı ziyaretçi
 * olduğunu bilmiyoruz, tahmin etmek (IP, parmak izi) hem yanlış hem de tutmadığımız veri.
 * Kimliksiz gürültü, tur hesaba bağlandığında kendiliğinden azalır — o an kaydırmaların aynı kişiye
 * ait olduğunu KESİN biliriz ve orada hiçbir tahmin yoktur.
 */
export function dedupeBySwiper(swipes: readonly CandidateSwipe[]): CandidateSwipe[] {
  const kimlikli = new Map<string, CandidateSwipe>();
  const kimliksiz: CandidateSwipe[] = [];
  for (const s of swipes) {
    if (!s.swiperId) {
      kimliksiz.push(s);
      continue;
    }
    const onceki = kimlikli.get(s.swiperId);
    // Karşılaştırma METİNLE değil TARİHLE: damgalar ofset taşıyabilir ve
    // `…T09:00+00:00` ile `…T10:00+02:00` aynı anı gösterdiği hâlde metin olarak ters sıralanır.
    if (!onceki || Date.parse(s.at) > Date.parse(onceki.at)) kimlikli.set(s.swiperId, s);
  }
  return [...kimlikli.values(), ...kimliksiz];
}

/** Ham kaydırma satırı — hangi tablodan geldiği önemsiz; motor yalnız bu dört alanı bilir. */
export interface RawSwipe {
  productId: string;
  vote: 'like' | 'dislike' | null;
  dwellMs: number | null;
  swiperId: string | null;
  at: string;
}

/**
 * Ham satırlar → ürün başına **ağırlıklı** kaydırma listesi.
 *
 * **Neden motorda ve neden ortak:** bu, iki ekranın birden sorduğu aynı sorunun tek cevabı — aday
 * panosu ("hangi ürün isteniyor") ve ürün skoru güven kolonu ("bu beğenilere ne kadar
 * güvenelim"). İkisi ayrı yerlerde hesaplasaydı biri gün gelip ötekinden farklı ağırlık uygular ve
 * fark hiçbir yerde hata VERMEZDİ: iki ekran aynı ürün için iki farklı güven gösterir, ikisi de
 * makul görünürdü (`CLAUDE §1`).
 *
 * Ağırlık iki adımda kurulur ve sıra önemli: önce kişinin deseni TÜM örneklem üzerinden sayılır,
 * sonra her kaydırma o desenle çarpılır. Desen ürün başına sayılsaydı "hep aynı yöne savuran"
 * kişi hiç yakalanamazdı — savurma zaten ürünler arasına dağılır.
 */
export function weighSwipesByProduct(rows: readonly RawSwipe[]): Map<string, CandidateSwipe[]> {
  // Kaydıranın deseni: kimlik başına beğeni/geçme sayıları. Kimliksiz kaydırmalar tek havuzda
  // toplanamaz — hangisinin aynı kişi olduğu bilinmiyor; onlara desen ağırlığı uygulanmaz.
  const kisiSayimi = new Map<string, { like: number; dislike: number }>();
  for (const row of rows) {
    if (!row.swiperId || !row.vote) continue;
    const sayim = kisiSayimi.get(row.swiperId) ?? { like: 0, dislike: 0 };
    if (row.vote === 'like') sayim.like += 1;
    else sayim.dislike += 1;
    kisiSayimi.set(row.swiperId, sayim);
  }

  const urunBasina = new Map<string, CandidateSwipe[]>();
  for (const row of rows) {
    if (!row.vote) continue;
    const sayim = row.swiperId ? kisiSayimi.get(row.swiperId) : undefined;
    const weight = swipeWeight({
      dwellMs: row.dwellMs,
      // Kimliksiz kaydırmada desen çıkarılamaz: nötr (dengeli) kabul edilir.
      swiperLikeCount: sayim?.like ?? 1,
      swiperDislikeCount: sayim?.dislike ?? 1,
    });
    const liste = urunBasina.get(row.productId) ?? [];
    liste.push({ vote: row.vote, weight, swiperId: row.swiperId, at: row.at });
    urunBasina.set(row.productId, liste);
  }
  return urunBasina;
}

export function candidateSignalOf(swipes: readonly CandidateSwipe[]): CandidateSignal {
  const likes = dedupeBySwiper(swipes).filter((s) => s.vote === 'like');
  const rawLikes = likes.length;
  const weightedLikes = likes.reduce((sum, s) => sum + s.weight, 0);
  return {
    weightedLikes: Math.round(weightedLikes * 100) / 100,
    rawLikes,
    trust: rawLikes === 0 ? 0 : Math.round((weightedLikes / rawLikes) * 100) / 100,
  };
}
