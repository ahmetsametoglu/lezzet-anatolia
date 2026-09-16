import Link from 'next/link';
import { DEFAULT_LOCALE, localizedPath } from '@lezzet/i18n';
import { getSessionUser } from '@/lib/guard';
import { buttonClass } from '@/components/operation/ui/button';
import { ErrorState } from '@/components/operation/ui/error-state';
import { AlertIcon } from '@/components/operation/ui/icons';
import { OAUTH_FAILURE_DETAIL, type OauthFailureDetail } from './failure';

/**
 * MCP bağlantısının (OAuth) hata ekranı. `/oauth/*` uçları route handler'dır; cevapları düz metin
 * gövdeydi ve tarayıcıda biçimsiz bir sayfa olarak açılıyordu — kişi ne olduğunu da çıkış yolunu da
 * göremiyordu. Akış burada biter: durum, hangi hesapla gelindiği ve iki kapı.
 */
const REASON = {
  not_admin: {
    tone: 'amber',
    title: 'Bu bağlantıyı yalnız yönetici kurabilir',
    description:
      'Asistan bağlantısı işletmenin verisini okur; bu yüzden yalnız yönetici hesabıyla kurulur. Yöneticiyseniz o hesapla girip bağlantıyı yeniden başlatın.',
  },
  invalid_request: {
    tone: 'red',
    title: 'Bağlantı isteği eksik geldi',
    description:
      'İsteği başlatan uygulama zorunlu alanları göndermedi — bu bir hesap sorunu değil. Bağlantıyı uygulamadan yeniden kurmayı deneyin.',
  },
} as const;

const CHIP = 'rounded-md border border-ops-line bg-ops-gray-25 px-2.5 py-[5px] font-ops-mono text-ops-sm text-ops-muted';

interface OauthErrorPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OauthErrorPage({ searchParams }: OauthErrorPageProps) {
  const params = await searchParams;
  // Sorgudan gelen değerler SÖZLÜĞE çarptırılır, ekrana taşınmaz: bağlantıyı kuran taraf bu sayfaya
  // kendi cümlesini yazdıramaz. Tanınmayan sebep, isteğin bozuk olduğu anlamına gelir.
  const rawReason = typeof params.reason === 'string' ? params.reason : '';
  const reason = rawReason in REASON ? (rawReason as keyof typeof REASON) : 'invalid_request';
  const rawDetail = typeof params.detail === 'string' ? params.detail : '';
  const detail = rawDetail in OAUTH_FAILURE_DETAIL ? (rawDetail as OauthFailureDetail) : null;

  // Künye yalnız yetki dalında sorulur: "yanlış hesapla girmiş olabilir miyim" sorusunu ancak orası
  // taşır ve cevabı bir Auth turuna mal olur.
  const email = reason === 'not_admin' ? ((await getSessionUser())?.email ?? null) : null;

  const copy = REASON[reason];

  return (
    <ErrorState tone={copy.tone} icon={<AlertIcon />} title={copy.title} description={copy.description}>
      {email ? <span className={CHIP}>Girişli hesap: {email}</span> : null}
      {detail ? <span className={CHIP}>{OAUTH_FAILURE_DETAIL[detail]}</span> : null}

      <div className="mt-0.5 flex gap-2">
        {reason === 'not_admin' ? (
          <Link href={`/${DEFAULT_LOCALE}${localizedPath('/login', DEFAULT_LOCALE)}`} className={buttonClass({ variant: 'primary' })}>
            Farklı hesapla gir
          </Link>
        ) : null}
        <Link href="/" className={buttonClass({ variant: reason === 'not_admin' ? 'secondary' : 'primary' })}>
          Markete dön
        </Link>
      </div>
    </ErrorState>
  );
}
