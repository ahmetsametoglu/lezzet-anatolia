import 'server-only';
import { cookies } from 'next/headers';

/**
 * **Davet belirteçlerinin ziyaretten kayda/siparişe taşındığı çerezler** (17.9 · 17.10).
 *
 * İki davet var ve ikisi de aynı taşıma sorununu yaşıyor, o yüzden aynı dosyada tek uygulama:
 *   · **getiren daveti** (`lz_invite`) — kod, KAYIT anında tüketilir (`auth/otp-actions`).
 *   · **komşu daveti** (`lz_neighbor`) — belirteç, SİPARİŞ anında tüketilir (`checkout/actions`).
 * Ayrı ayrı yazılsalardı iki `httpOnly`/`sameSite`/`secure` üçlüsü olurdu ve biri bir gün ötekinden
 * ayrışırdı — sessizce, çünkü yanlış bir çerez bayrağı hata vermez, yalnız daveti kaybettirir.
 *
 * ── NEDEN ÇEREZ, NEDEN SORGU DİZESİ DEĞİL ────────────────────────────────────
 * Davetli bağlantıya tıkladığı an kaydolmaz ya da sipariş vermez: katalogu gezer, sepet kurar,
 * belki ertesi gün döner. Kodu `?ref=…` ile taşımak, o yolculuğun ilk iç bağlantısında kaybetmek
 * demekti — ve kaybı kimse görmezdi, çünkü kayıt/sipariş yine tamamlanır, yalnız davet eden hiç
 * kazanmazdı. Sessiz kayıp, bu işin tamamının sebebi olan arıza sınıfı.
 *
 * `httpOnly`: istemcinin okumasına gerek yok ve bir başkasının davet belirtecini tarayıcı betiğiyle
 * okutmak, ona ait bir künyeyi sızdırmaktır. `sameSite: 'lax'`: bağlantı WhatsApp'tan, mailden,
 * Instagram'dan gelir — üst düzey gezinme çerezi taşımalı; `strict` tam da bu akışta düşerdi.
 *
 * ── İKİ AYRI ÖMÜR, ÇÜNKÜ İKİ AYRI SÖZ ───────────────────────────────────────
 * Getiren daveti **30 gün**: bir tanıştırmadır, aynı hafta kaydolmayan davetli de getirenindir.
 * Komşu daveti **7 gün**: belli bir SEFERE çağırır ve o sefer birkaç gün içinde geçer; daha uzun
 * tutmak, ölmüş bir daveti tarayıcıda taşımak olurdu. İkisinin de sonsuz olmaması, davetin
 * ÖLÇÜLEBİLİR kalması için — iki yıl sonraki bir siparişin sebebini o bağlantıya yazmak, olmayan
 * bir nedenselliği kayda geçirmek olurdu.
 */
const REFERRAL_COOKIE = 'lz_invite';
const REFERRAL_MAX_AGE_SEC = 30 * 24 * 60 * 60;

const NEIGHBOR_COOKIE = 'lz_neighbor';
const NEIGHBOR_MAX_AGE_SEC = 7 * 24 * 60 * 60;

async function remember(name: string, value: string, maxAge: number): Promise<void> {
  const jar = await cookies();
  jar.set(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
}

async function read(name: string): Promise<string | null> {
  return (await cookies()).get(name)?.value ?? null;
}

async function forget(name: string): Promise<void> {
  (await cookies()).delete(name);
}

/** Getiren davetini kabul eden ziyaretçinin kodunu saklar. Yalnız server action / route handler. */
export function rememberInvite(code: string): Promise<void> {
  return remember(REFERRAL_COOKIE, code, REFERRAL_MAX_AGE_SEC);
}

/** Taşınan getiren kodu — yoksa `null`. Okumak yan etkisizdir; tüketimi `forgetInvite` yapar. */
export function readInvite(): Promise<string | null> {
  return read(REFERRAL_COOKIE);
}

/**
 * Getiren çerezini düşürür. **Kayıt tamamlandığında koşulsuz çağrılır** — bağ kurulmuş olsun ya da
 * olmasın: tüketilmiş bir davet, tarayıcıda otuz gün daha durup sonraki hiçbir işe yaramaz.
 * Bırakılsaydı aynı tarayıcıdan açılan ikinci hesap da o kodu taşır ve "ilk getiren kazanır"
 * kuralı bir aile bilgisayarında sessizce yanlış tarafa çalışırdı.
 */
export function forgetInvite(): Promise<void> {
  return forget(REFERRAL_COOKIE);
}

/** Komşu davetini kabul eden ziyaretçinin belirtecini saklar (17.10). */
export function rememberNeighborInvite(token: string): Promise<void> {
  return remember(NEIGHBOR_COOKIE, token, NEIGHBOR_MAX_AGE_SEC);
}

/** Taşınan komşu belirteci — checkout siparişi açarken okur. */
export function readNeighborInvite(): Promise<string | null> {
  return read(NEIGHBOR_COOKIE);
}

/**
 * Komşu çerezini düşürür — **kabul kişiye yazıldıktan sonra** (12.08 kararı).
 *
 * Artık getiren çereziyle AYNI zamanlama: ikisi de KİMLİK adımında tüketiliyor. Önce sipariş
 * adımında tüketiliyordu ve o kurgu kullanıcının sorduğu yolculuğu kırıyordu — web'de hesap açıp
 * uygulamayı sonra yükleyen kişide davet kalmıyordu, çünkü tek kopyası tarayıcıdaydı. Kabul
 * `neighbor_invite_claim`e geçtikten sonra çerezin taşıyacak bir şeyi kalmıyor.
 */
export function forgetNeighborInvite(): Promise<void> {
  return forget(NEIGHBOR_COOKIE);
}
