import { NextResponse } from 'next/server';
import { serviceDb } from '@lezzet/database';
import { logger, maskEmail } from '@lezzet/observability';
import { createClient } from '@/lib/supabase/server';
import { devLoginOpen } from '@/lib/auth/dev-login-gate';
import { resolvePostLoginRedirect } from '@/lib/auth/redirect';

/*
  HIZLI GİRİŞ KAPISI — mobildeki `/api/v1/auth/dev-session`in web karşılığı (kullanıcı isteği
  15.08). Mail turunu atlar, ama kurduğu oturum GERÇEKTİR: admin API'den magic-link üretilir
  (`generateLink` yalnız ÜRETİR, mail göndermez), jeton SSR istemcisinde tüketilir ve çerez
  normal giriş akışının yazdığının aynısı olur.

  ── NEDEN BYPASS'I ÜRETİME AÇMAK DEĞİL ──────────────────────────────────────
  İhtiyaç şuydu: paralel production sunucusunda (`pnpm prod:web:start`, 3001) operasyon
  ekranlarına admin olarak bakabilmek. `guard.ts`in dev bypass'ı orada ÖLÜYDÜ ve öyle kalmalıydı —
  künyesi *"production build'de env ne olursa olsun ASLA aktif olmaz"* diyordu ve o cümle bir
  güvenlik güvencesiydi; gevşetilseydi gerçek dağıtımda yanlış konmuş tek bir env değişkeni
  operasyon panelini herkese açardı.

  Bu kapı guard'a HİÇ DOKUNMAZ. Farkı da tam olarak buydu: bypass auth'u ATLIYORDU (guard sahte bir
  kullanıcı görüyordu), bu kapı auth'u İŞLETİR. Yani ekranlar production'da nasıl davranacaksa öyle
  davranır — RLS, personel çözümü, denetim kaydındaki `actor_id`, oturum süresi, hepsi gerçek.
  Test edilen şey de zaten bu.

  ── VE BYPASS ARTIK YOK (19.08) ─────────────────────────────────────────────
  Yukarıdaki karşılaştırma bu kapının 15.08'deki gerekçesiydi; dört gün sonra aynı gerekçe
  bypass'ın kendisini götürdü. Ölçüldü: oturumsuz `localhost:3000/operations` → **200**, aynı istek
  3001'de → **307 → /tr/giris**. Yani iki sunucu iki farklı yetki gerçekliği gösteriyordu ve
  guard'ın koruduğu şey yerelde hiç denenmiyordu. Anlatı `apps/web/lib/guard.ts` künyesinde.

  Sonuç: bu kapı artık bir SEÇENEK değil, operasyona yerelde girmenin TEK yolu — e2e dahil
  (`e2e/setup/operations-auth.setup.ts`).

  ── ÜÇ KİLİT, VE HİÇBİRİ `NODE_ENV` DEĞİL ───────────────────────────────────
  `NODE_ENV` ölçüt olamaz: bu kapının VAROLUŞ SEBEBİ production derlemesinde çalışması. Yerine
  üçü BİRDEN aranıyor — biri unutulursa ötekiler tutar:

    1. `DEV_LOGIN_ENABLED === 'true'` — açık, bilinçli beyan. Varsayılan KAPALI: env'i olmayan
       bir dağıtımda bu rota hiçbir şey yapmaz, 404 döner. Kapalıyken var olduğunu bile
       söylemez — "burada bir kapı var ama sana kapalı" demek, kapının yerini söylemektir.
    2. `NEXT_PUBLIC_SITE_URL` YEREL bir adres olmalı. **Asıl ikinci kilit budur**, çünkü bu bir
       SUNUCU YAPILANDIRMASIDIR — isteği gönderen onu değiştiremez. Gerçek dağıtımda oraya
       gerçek alan adı yazılır ve kapı, bayrak açık unutulsa bile kapalı kalır.
    3. İstek yerel bir host'a gelmiş olmalı (`localhost` / `127.0.0.1` / `[::1]`). Bu kilit
       **tek başına yeterli DEĞİL ve öyle sunulmamalı**: `Host` başlığını isteği gönderen yazar,
       yani uydurulabilir. Ucuz bir ilk elemedir, güvenliğin dayandığı yer 1 ve 2'dir.
       `x-forwarded-host` da okunuyor — proxy arkasında gerçek host odur (callback rotasının
       aynı deseni), yoksa proxy'nin kendi `host`u her isteği "yerel" gösterirdi.

  ── E-POSTA SÜZGECİ YOK, VE BİLİNÇLİ ──────────────────────────────────────────
  Mobil kapının aynı kararı: yerel veritabanı, yerel ağ, ve test hesabı değiştikçe uca dokunmak
  gerekmesin. İki kilit zaten yüzeyi yerel süreçle sınırlıyor; üçüncü bir liste yalnız bakım
  yükü olurdu. Varsayılan adres seed'in yöneticisidir (`scripts/seed/people.ts`), yani çıplak
  `/auth/dev-login` doğrudan admin oturumu açar.

  Kullanımı (production sunucusu 3001'de ayaktayken):
    http://localhost:3001/auth/dev-login                                  → yönetici
    http://localhost:3001/auth/dev-login?email=depo@lezzetanatolia.fr     → depo
    http://localhost:3001/auth/dev-login?next=/operations/products        → hedefi seç
*/

/** Seed'in yöneticisi (`people.ts` → `yonetici`). Adres seed'le AYNI olmak zorunda. */
const DEFAULT_EMAIL = 'yonetim@lezzetanatolia.fr';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;

  // KAPALIYKEN VAR OLDUĞUNU SÖYLEMEZ: 404, "yasak" değil. Ayrım önemli — 403 "burada bir kapı
  // var" der ve arayan kişiye aradığı şeyi bulduğunu doğrular.
  if (!devLoginOpen(host)) {
    return new NextResponse(null, { status: 404 });
  }

  const email = url.searchParams.get('email') ?? DEFAULT_EMAIL;
  const next = url.searchParams.get('next');

  const db = serviceDb();
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = data?.properties?.hashed_token;
  if (error !== null || !tokenHash) {
    /* SEBEP YUTULMAZ (mobil kapının ölçülmüş dersi, 11.08): burada ret gerekçesiz dönseydi
       teşhis edilemezdi — `.local` uzantılı adres reddediliyor, gerçek alan adlılar geçiyor ve
       o farkı ancak Supabase'in kendi mesajı söyler. Kapı zaten yerel, mesaj HAM gidiyor. */
    logger.warn(
      { context: 'auth/dev-login', email: maskEmail(email), reason: error?.message ?? 'jeton boş' },
      'hızlı giriş hesabı açılamadı',
    );
    return NextResponse.json({ error: error?.message ?? 'jeton üretilemedi' }, { status: 400 });
  }

  // Jetonu SSR istemcisi tüketir → oturum ÇEREZE düşer (`otp-actions.verifyEmailOtp`in aynı adımı).
  const supabase = await createClient();
  const { data: session, error: sessionErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (sessionErr || !session.user) {
    logger.warn(
      { context: 'auth/dev-login', reason: sessionErr?.message ?? 'kullanıcı boş' },
      'hızlı giriş oturumu açılamadı',
    );
    return NextResponse.json({ error: sessionErr?.message ?? 'oturum açılamadı' }, { status: 400 });
  }

  // Hedef ROLDEN çözülür, elle yazılmaz: iki-yüzey kuralının tek sahibi bu fonksiyondur
  // (personel → `/operations`, müşteri → vitrin). Kurye adresiyle girildiğinde kurye ekranına
  // düşmesi de bu yüzden kendiliğinden doğru olur.
  const redirect = await resolvePostLoginRedirect(session.user.id, next);
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return NextResponse.redirect(`${proto}://${host}${redirect}`);
}
