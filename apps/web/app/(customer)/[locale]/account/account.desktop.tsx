import { Link } from '@/i18n/navigation';
import type { AccountViewProps } from './account-types';
import { Card, CardHead, ConsentSwitch, PointsCard, Row, SavedList } from './components/account-cards';

/**
 * Hesabım — masaüstü (tasarım: `Musteri - Hesap.dc.html`, "Hesap Web").
 *
 * Düzen tasarımın kendisi: **iki eşit sütun**. Solda kimliğe ve tercihe ait olan (profil, adresler,
 * izinler, veri notu), sağda hesabın kendisine ait olan (puan, kaydedilenler, gezinme). Ayrım
 * keyfi değil — sol sütun "ben kimim", sağ sütun "hesabımda ne var" sorusunu cevaplıyor.
 */
export function AccountDesktop({ t, locale, account }: AccountViewProps) {
  const compact = false;
  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-12 py-8">
      <h1 className="font-serif text-page-title leading-tight text-ink">{t.title}</h1>

      <div className="grid grid-cols-2 items-start gap-5">
        <div className="flex flex-col gap-5">
          <Card compact={compact}>
            {/* BEKLEYEN(08.5): profil düzenleme (satır içi form) — tasarımda çizili, kapı bekliyor. */}
            <CardHead title={t.profileTitle} compact={compact} action={<Stub label={`${t.edit} · ${t.soon}`} />} />
            <Row label={t.name} value={account.profile.name || '—'} />
            <Row label={t.email} value={account.profile.email ?? '—'} />
            <Row label={t.phone} value={account.profile.phone ?? t.noPhone} />
            {/* Dil hapı okur: değişimi başlıktaki/footer'daki dil bağlantıları yapar — ikinci bir
                dil değiştirici, hangisinin geçerli olduğunu sordururdu. */}
            <Row
              label={t.language}
              value={<span className="rounded-pill border-[1.5px] border-sand-400 px-3.5 py-1.5 font-sans text-note">{LANGUAGE_LABEL[account.profile.preferredLanguage]}</span>}
            />
          </Card>

          {account.company && (
            <Card compact={compact}>
              <CardHead
                title={t.companyTitle}
                compact={compact}
                action={<span className="rounded-pill bg-olive-bg px-2.5 py-0.5 font-sans text-micro font-bold text-olive">{t.companyApproved}</span>}
              />
              <Row label={t.companyLegalName} value={account.company.legalName} />
              {account.company.siret && <Row label={t.companySiret} value={account.company.siret} />}
              <span className="font-sans text-micro leading-relaxed text-muted">{t.companyNote}</span>
            </Card>
          )}

          <Card compact={compact}>
            {/* BEKLEYEN(08.5): adres ekleme/düzenleme/silme — form checkout'ta var, hesapta yok. */}
            <CardHead title={t.addressesTitle} compact={compact} note={t.addressesNote} action={<Stub label={`${t.addressAdd} · ${t.soon}`} />} />
            {account.addresses.length === 0 && <span className="font-sans text-note text-muted">{t.addressEmpty}</span>}
            {account.addresses.map((address) => (
              <div
                key={address.id}
                className={[
                  'flex items-center justify-between gap-3 rounded-soft px-4 py-3.5',
                  // Varsayılan adres ZEYTİN çerçeveli (tasarım): teslimat yeri göstergesini o besliyor.
                  address.isDefault ? 'border-[1.5px] border-olive bg-olive-bg' : 'border border-sand-200 bg-card',
                ].join(' ')}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-sans text-body-sm font-bold text-ink">
                    {address.label || address.city}
                    {address.isDefault && ` · ${t.addressDefault}`}
                  </span>
                  <span className="truncate font-sans text-note text-body">
                    {address.line1}, {address.postalCode} {address.city}
                  </span>
                </div>
              </div>
            ))}
          </Card>

          <Card compact={compact}>
            <CardHead title={t.consentTitle} compact={compact} />
            <ConsentSwitch label={t.consentEmail} on={account.consent.email} />
            <ConsentSwitch label={t.consentWhatsapp} on={account.consent.whatsapp} />
            <span className="font-sans text-micro leading-relaxed text-muted">{t.consentNote}</span>
          </Card>

          <Card compact={compact}>
            <CardHead title={t.dataTitle} compact={compact} />
            {/* BEKLEYEN(08.8): gizlilik politikası sayfası — bağ VERİLMEZ, ölü link 404'e düşerdi. */}
            <span className="font-sans text-note leading-relaxed text-body">{t.dataBody.replace('{email}', CONTACT_EMAIL)}</span>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {account.points && <PointsCard t={t} locale={locale} points={account.points} compact={compact} />}

          <Card compact={compact}>
            <CardHead title={t.savedTitle} compact={compact} />
            <span className="font-sans text-micro leading-relaxed text-muted">{t.savedNote}</span>
            <SavedList t={t} locale={locale} saved={account.saved} compact={compact} />
          </Card>

          <Card compact={compact}>
            <CardHead title={t.linksTitle} compact={compact} />
            <Link href="/orders" className="flex items-center justify-between gap-3 border-b border-sand-100 pb-2.5 font-sans text-body-sm font-bold text-ink transition-colors hover:text-olive">
              <span>{t.linkOrders}</span>
              <span className="text-olive">→</span>
            </Link>
            {/* BEKLEYEN(16.1): talep/şikâyet ekranı — bağ verilseydi 404'e düşerdi. */}
            <span className="flex items-center justify-between gap-3 font-sans text-body-sm font-bold text-muted">
              <span>{t.linkSupport}</span>
              <span className="font-normal">{t.soon}</span>
            </span>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Henüz bağlanmamış eylem — yerinde durur ve neden basılamadığını söyler (CLAUDE.md §3). */
export function Stub({ label }: { label: string }) {
  return <span className="flex-none font-sans text-note font-bold text-muted">{label}</span>;
}

const LANGUAGE_LABEL: Record<string, string> = { tr: 'Türkçe', fr: 'Français', de: 'Deutsch' };

/**
 * Veri talebi adresi. `@lezzet/brand`'de böyle bir sabit YOK ve oraya eklemek bu işin kapsamı
 * değil; metne gömmek yerine tek yerde durur — marka paketine taşındığında tek satır değişir.
 */
const CONTACT_EMAIL = 'bonjour@lezzetanatolie.com';
