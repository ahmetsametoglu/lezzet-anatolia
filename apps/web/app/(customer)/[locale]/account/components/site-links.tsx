import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { LocaleLinks } from '@/components/customer/ui/locale-switch';
import { LEGAL_LINKS } from '@/components/customer/ui/site-frame';
import frame from '@/components/customer/ui/site-frame-messages.json';

/**
 * Dil seçimi + yasal bağlantılar — MOBİL WEBDE hesap ekranının en altı (kullanıcı kararı 13.09).
 *
 * `Musteri Mobil v1.dc.html` hiçbir ekranda footer çizmiyor; yasal sayfalara yalnız girişli
 * müşterinin kısayolu gidiyordu, misafirin yolu yoktu ve dil seçimi hiç yoktu. İkisi burada, en az
 * görünür biçimde: sekme çubuğu her ekranda durduğu için her sayfadan iki dokunuş, misafir de görür.
 *
 * Liste ve metinler çerçevenin (`LEGAL_LINKS` · `site-frame-messages`): masaüstü footer'ıyla aynı
 * sayfalar aynı sırada — ikinci bir liste yazılsaydı bir gün biri eksik kalırdı.
 */
interface SiteLinksProps {
  locale: Locale;
}

export function SiteLinks({ locale }: SiteLinksProps) {
  const t = frame[locale];
  return (
    <div className="flex flex-col gap-2 border-t border-sand-200 px-1 pt-3.5 font-sans text-micro text-muted">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{t.footer.language}:</span>
        <LocaleLinks locale={locale} className="cursor-pointer transition-colors hover:text-olive" activeClassName="font-bold text-ink" separator="·" />
      </div>
      <nav className="flex flex-wrap gap-x-4 gap-y-1.5">
        {LEGAL_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="cursor-pointer transition-colors hover:text-olive">
            {t.legal[item.key]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
