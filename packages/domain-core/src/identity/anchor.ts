import type { ChallengeReason } from '@lezzet/types';

/**
 * **Kimlik çapası** (04.10) — saf kararlar. DOMAIN §10 ("Kimlik anahtarı, çapa ve süreklilik").
 *
 * Numaranın kanıtlanması *"bu hat BUGÜN bu kişide"* der. Çapa başka bir soruyu cevaplar:
 * **"bu numaranın GEÇMİŞİ kimin?"** — zilyetlik gerçektir ama bağ bayat olabilir. Operatör
 * karantina süresi dolan bir numarayı yeniden dağıtır; yeni sahibi hattı meşru olarak elinde tutar
 * ve gelen kodu da meşru olarak alır. **OTP bunu çözmez.** Çözen tek şey, şüphe doğmadan ÖNCE
 * kurulmuş bir sırdır.
 *
 * Bu dosya DB'ye bakmaz: çağıranın getirdiği künyeye bakıp ne yapılacağını söyler (STACK §4).
 */

/** Çapa hâli — üç kaynaktan TÜRETİLİR, saklanmaz. */
export type AnchorState =
  /** Posta kutusu kanıtlandı: ya çapraz kanaldan (kod e-postaya, cevap WhatsApp'tan) ya OTP girişiyle. */
  | 'email'
  /** E-posta bağlamak istemedi; elinde 6 haneli kod var. */
  | 'code'
  /** Hiç çapa yok — geçmişe açılan kapılar kapalı. */
  | 'none';

/** Çapa kararının okuduğu künye — `UserProfile`'ın ilgili alanları (view-model türetme, CLAUDE §1). */
export interface AnchorFacts {
  authUserId: string | null;
  emailAnchoredAt: string | null;
  securityCodeHash: string | null;
}

/**
 * **Çapa hâli.** Sıra önemli: e-posta koddan önce gelir, çünkü ikisi bir arada bulunmaz (kod,
 * e-posta kanıtlandığında silinir — DB kısıtı zorluyor) ve `authUserId` tek başına yeterlidir.
 *
 * `authUserId` neden e-posta çapası sayılır: müşteri o posta kutusuna gelen kodla giriş yapmıştır.
 * Çapraz kanal kanıtından farkı taşıyıcıdır, gücü değil.
 */
export function anchorStateOf(facts: AnchorFacts): AnchorState {
  if (facts.authUserId || facts.emailAnchoredAt) return 'email';
  if (facts.securityCodeHash) return 'code';
  return 'none';
}

/**
 * **Kimliği bilmeden ne açtığımız asıl sorudur** (DOMAIN §10).
 *
 * Sipariş almak geçmiş gerektirmez — kapılı olan üç yetki: geçmişi göstermek · puanı harcatmak ·
 * kişiye özel fiyat/kupon uygulamak. Üçü de "seni tanıyorum" demektir ve yanlış kişiye söylenirse
 * sızıntının kendisidir.
 *
 * **Kapı çapanın VARLIĞINA bakar, tazeliğine değil.** Kodun o an sorulup sorulmayacağı ayrı bir
 * karardır (`needsChallenge`): rutin sormak müşteriyi yorar ve kodu sıradanlaştırır.
 */
export function canOpenHistory(state: AnchorState): boolean {
  return state !== 'none';
}

export interface ChallengeInput {
  state: AnchorState;
  /** Bu numaradan gelen SON mesajın anı (`customer_phone.last_seen_at`); `null` = hiç görülmedi. */
  lastSeenAt: string | null;
  /** Taşıyıcı bu numara için `failed` döndü mü (15.7 statü olayları). */
  deliveryFailed: boolean;
  /** Sessizlik eşiği (gün). Parametrik — DOMAIN §10 ~3 ay diyor. */
  silenceDays: number;
  now: Date;
}

/**
 * **Kod rutin sorulmaz, TETİĞE bağlı sorulur.**
 *
 * İki tetik var ve biri ötekinin yerine geçmez:
 *   · `delivery_failed` — taşıyıcının BEYANI. Tahmin değil: numara kapanmış ya da engellenmiş.
 *     3 aylık eşiği beklemenin anlamı yok, bağ zaten şüpheli.
 *   · `silence` — GEÇ tetik. `delivered` gelip okunmaması hâlâ belirsizdir (telefon kapalı,
 *     bildirim kapalı, umursamamış); `sent`te kalan mesaj da hiçbir şey söylemez.
 *
 * **Boşluğun kendisi teşhis DEĞİLDİR:** yılda bir bayramda sipariş veren sadık müşteri ile
 * devredilmiş hat aynı şekli üretir. Bu yüzden dönüş sorusu bir KAPI değil bir SORUDUR —
 * cevaplanamazsa müşteri engellenmez, yalnız geçmişi açılmaz (çağıranın işi).
 *
 * Çapası olmayan müşteriye sorulacak bir şey yoktur: sorumak, cevabı olmayan bir soruyu sormaktır.
 */
export function needsChallenge(input: ChallengeInput): ChallengeReason | null {
  if (input.state === 'none') return null;
  if (input.deliveryFailed) return 'delivery_failed';
  if (!input.lastSeenAt) return null;

  const gecenGun = (input.now.getTime() - new Date(input.lastSeenAt).getTime()) / 86_400_000;
  return gecenGun >= input.silenceDays ? 'silence' : null;
}

/**
 * **Mesajın içindeki 6 haneli kod.**
 *
 * Yalnız BEKLEYEN bir soru varken çağrılır ve bu bir uygulama kuralı değil, bu ayrıştırıcının
 * varlık şartı: gelen mesajlarda altı haneli sayı boldur (sipariş referansı, adet, tutar, saat).
 * Her mesajı tarayan bir okuma, kodu tahmin etmeye çalışan birine ücretsiz deneme dağıtırdı.
 *
 * Sınırlar rakam olmayanla çevrili (`\D`): "123456" kodu, "1234567" içinde EŞLEŞMEZ — yoksa yedi
 * haneli bir referans numarası altı haneli bir kodu doğrularmış gibi görünürdü.
 */
export function sixDigitCodeIn(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = /(?:^|\D)(\d{6})(?:\D|$)/.exec(text);
  return match ? match[1]! : null;
}
