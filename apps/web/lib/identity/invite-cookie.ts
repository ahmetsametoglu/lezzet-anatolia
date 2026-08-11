import 'server-only';
import { cookies } from 'next/headers';

/**
 * **Davet kodunun ziyaretten kayda kadar taşındığı çerez** (17.9).
 *
 * ── NEDEN ÇEREZ, NEDEN SORGU DİZESİ DEĞİL ────────────────────────────────────
 * Davetli bağlantıya tıkladığı an kaydolmaz: katalogu gezer, sepet kurar, belki ertesi gün döner.
 * Kodu `?ref=…` ile taşımak, o yolculuğun ilk iç bağlantısında kaybetmek demekti — ve kaybı kimse
 * görmezdi, çünkü kayıt yine tamamlanır, yalnız getiren hiç kazanmazdı. Sessiz kayıp, bu işin
 * tamamının sebebi olan arıza sınıfı.
 *
 * `httpOnly`: istemcinin okumasına gerek yok ve bir başkasının davet kodunu tarayıcı betiğiyle
 * okutmak, ona ait bir künyeyi sızdırmaktır. `sameSite: 'lax'`: bağlantı WhatsApp'tan, mailden,
 * Instagram'dan gelir — üst düzey gezinme çerezi taşımalı; `strict` tam da bu akışta düşerdi.
 *
 * **30 gün** çünkü davet bir kampanya değil bir tanıştırma: aynı hafta içinde kaydolmayan davetli
 * de getirenindir. Süresiz olmaması ise davetin ÖLÇÜLEBİLİR kalması için — iki yıl sonra kaydolan
 * ziyaretçinin sebebini o bağlantıya yazmak, olmayan bir nedenselliği kayda geçirmek olurdu.
 */
const INVITE_COOKIE = 'lz_invite';
const INVITE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

/** Daveti kabul eden ziyaretçinin kodunu saklar. Yalnız server action / route handler çağırabilir. */
export async function rememberInvite(code: string): Promise<void> {
  const jar = await cookies();
  jar.set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INVITE_MAX_AGE_SEC,
  });
}

/** Taşınan kod — yoksa `null`. Okumak yan etkisizdir; tüketimi `forgetInvite` yapar. */
export async function readInvite(): Promise<string | null> {
  return (await cookies()).get(INVITE_COOKIE)?.value ?? null;
}

/**
 * Çerezi düşürür. **Kayıt tamamlandığında koşulsuz çağrılır** — bağ kurulmuş olsun ya da olmasın:
 * tüketilmiş bir davet, tarayıcıda otuz gün daha durup sonraki hiçbir işe yaramaz. Bırakılsaydı
 * aynı tarayıcıdan açılan ikinci hesap da o kodu taşır ve "ilk getiren kazanır" kuralı bir aile
 * bilgisayarında sessizce yanlış tarafa çalışırdı.
 */
export async function forgetInvite(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}
