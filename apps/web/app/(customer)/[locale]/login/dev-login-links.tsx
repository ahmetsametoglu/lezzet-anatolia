import { headers } from 'next/headers';
import { DEV_LOGIN_ACCOUNTS, devLoginOpen } from '@/lib/auth/dev-login-gate';

/*
  HIZLI GİRİŞ DÜĞMELERİ — mobil giriş ekranının alt şeridinin web karşılığı (kullanıcı isteği
  15.08: *"tıpkı mobil projesinde olduğu gibi ben butona basıp da oradan giriş yapabilecek
  miyim? Sonrasında rollere göre de"*).

  ── SUNUCU BİLEŞENİ, VE İSTEMCİ JS'İ YOK ────────────────────────────────────
  Düğmeler düz bağlantı (`<a>`): tıklanınca `/auth/dev-login?email=…` açılır, oturum çereze
  yazılır, rota rolü çözüp yönlendirir. Bir `onClick` yazmak için bileşeni istemciye taşımak
  gerekirdi ve karşılığında hiçbir şey kazanılmazdı — form yok, durum yok.

  ── CİHAZ FORKUNUN DIŞINDA (bilinçli) ───────────────────────────────────────
  Giriş ekranı `login.desktop` / `login.mobile` diye ayrılıyor (CLAUDE §2). Bu şerit ikisinin de
  ALTINDA, `page.tsx`ten çiziliyor — çünkü ikisine ayrı ayrı konsaydı aynı liste iki dosyada
  yaşardı ve biri güncellenmeyi unuturdu. Geliştirme aracı olduğu için tasarım forkuna girmesi
  de gerekmiyor.

  ── KAPI BURADA DA SORULUYOR, "nasılsa rota reddeder" DENMİYOR ──────────────
  Kapalıyken şerit HİÇ çizilmez: çizilip 404 veren bir düğme, geliştiriciye kapının bozuk
  olduğunu düşündürür. Kilit `lib/auth/dev-login-gate`te tek yerde — rotayla aynı cevabı verir.
*/

export async function DevLoginLinks() {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  if (!devLoginOpen(host)) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-4">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-soft bg-sand-50/95 px-4 py-2 shadow-md">
        <span className="font-sans text-micro font-bold uppercase tracking-wide text-muted">Hızlı giriş</span>
        {DEV_LOGIN_ACCOUNTS.map((account) => (
          <a
            key={account.email}
            href={`/auth/dev-login?email=${encodeURIComponent(account.email)}`}
            // Müşteri zeytin, operasyon terracotta — hangi yüzeye gidildiği RENKTEN okunur
            // (mobil şeridin aynı ayrımı: `dev-login.ts` → `operations` bayrağı).
            className={`cursor-pointer font-sans text-note font-bold hover:underline ${
              account.operations ? 'text-terracotta-bright' : 'text-olive'
            }`}
          >
            {account.label}
          </a>
        ))}
      </div>
    </div>
  );
}
