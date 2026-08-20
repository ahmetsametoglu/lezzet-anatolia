import 'server-only';

/*
  HIZLI GİRİŞ KAPISININ KİLİDİ VE HESAPLARI — tek kaynak (kullanıcı isteği 15.08).

  İki tüketicisi var ve ikisi de aynı cevabı vermek ZORUNDA: rotanın kendisi
  (`app/auth/dev-login/route.ts`) ve giriş ekranındaki düğme şeridi. Kilit iki yere ayrı ayrı
  yazılsaydı biri bir gün ötekinden ayrılırdı — ekranın "kapalı" sanıp düğmeyi çizmediği ama
  rotanın açık kaldığı hâl, ya da tersi: çizilen ama 404 veren düğme.

  Kapının NE OLDUĞU, neden bypass'ın seçilmediği ve üç kilidin gerekçesi rotanın künyesinde.
  Burada yalnız KARAR var, anlatı orada.
*/

/**
 * Düğme şeridinin hesapları — SIRA düğme sırasıdır, mobil kapının (`apps/mobile/src/lib/auth/
 * dev-login.ts`) listesiyle bilerek AYNI.
 *
 * **Adresler `scripts/seed/people.ts`in malıdır** ve buradaki kopya ona bağlıdır: seed'de adres
 * değişirse burası da değişmeli. Tek kaynağa indirmenin yolu bugün yok — `scripts/` bir paket
 * değil, web ondan import edemez; adresleri `packages/types`a taşımak ise geliştirme verisini
 * sözleşme paketine sokmak olurdu. Bilinçli, dar ve künyeli bir tekrar.
 *
 * ── MÜŞTERİ DÜĞMESİ DE SEED'İN OLDU (kullanıcı kararı 19.08) ─────────────────
 * Bu düğme kullanıcının KENDİ adresine (`yamansehzade@gmail.com`) basıyordu ve o adres bir müşteri
 * değil: `auth.users`ın en eski satırı olduğu için `0002`nin *"hiç admin yoksa ilk hesap admin
 * olur"* açılışı onu ADMİN yapmıştı. Yani "Müşteri" yazan düğme operasyona giriyordu (kullanıcı
 * bulgusu 19.08). 21.32 aynı arızayı personel düğmelerinde ölçüp çözmüştü — adresi seed'e taşımak;
 * bu, o kuralın uygulanmadığı son düğmeydi. Seed artık `claire.weber@example.fr`e giriş hesabı
 * açıyor (`seedStaffLogins` künyesi) — siparişli, adresli, puanlı bir müşteri.
 */
export const DEV_LOGIN_ACCOUNTS = [
  { label: 'Müşteri', email: 'claire.weber@example.fr', operations: false },
  { label: 'Yönetim', email: 'yonetim@lezzetanatolia.fr', operations: true },
  { label: 'Depo', email: 'depo@lezzetanatolia.fr', operations: true },
  { label: 'Kurye', email: 'kurye@lezzetanatolia.fr', operations: true },
  { label: 'Muhasebe', email: 'muhasebe@lezzetanatolia.fr', operations: true },
] as const;

/** Yerel sayılan host adları — port ayrılır, `[::1]` köşeli parantezle gelir. */
function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '::1';
}

/**
 * Sunucunun KENDİ yapılandırması yerel mi — kilit 2 ve asıl dayanak. İstek başlığına bakmaz,
 * bu yüzden uydurulamaz. Adres okunamıyorsa kapı KAPALI sayılır: belirsizlik açık kapıya
 * yorulmaz.
 */
function siteUrlIsLocal(): boolean {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return false;
  try {
    return isLocalHost(new URL(raw).host);
  } catch {
    return false;
  }
}

/**
 * Kapı açık mı — üç kilit birden. `host` isteğin gördüğü host'tur (`x-forwarded-host` ?? `host`);
 * çağıran onu kendi bağlamından çözer, çünkü rota `Request`e, ekran `headers()`e sahip.
 */
export function devLoginOpen(host: string): boolean {
  return process.env.DEV_LOGIN_ENABLED === 'true' && siteUrlIsLocal() && isLocalHost(host);
}
