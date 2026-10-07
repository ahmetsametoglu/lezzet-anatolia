import { headers } from 'next/headers';
import { DEV_LOGIN_ACCOUNTS, devLoginOpen } from '@/lib/auth/dev-login-gate';

/*
  Geliştirme girişi düz bağlantıdır (`/auth/dev-login?email=…`), istemci JS'i gerekmez. Kapı kapalıyken hiç çizilmez:
  kilit `dev-login-gate`te, rotayla aynı cevabı verir.
*/

interface DevLoginLinksProps {
  /** Telefon görünümünde yalnız müşteri hesabı — operasyonun web'de telefon görünümü yok. */
  customerOnly: boolean;
}

export async function DevLoginLinks({ customerOnly }: DevLoginLinksProps) {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  if (!devLoginOpen(host)) return null;
  const accounts = customerOnly ? DEV_LOGIN_ACCOUNTS.filter((account) => !account.operations) : DEV_LOGIN_ACCOUNTS;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-4">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-soft bg-sand-50/95 px-4 py-2 shadow-md">
        <span className="font-sans text-micro font-bold uppercase tracking-wide text-muted">Hızlı giriş</span>
        {accounts.map((account) => (
          <a
            key={account.email}
            href={`/auth/dev-login?email=${encodeURIComponent(account.email)}`}
            // Müşteri zeytin, operasyon terracotta: hangi yüzeye gidildiği renkten okunur.
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
