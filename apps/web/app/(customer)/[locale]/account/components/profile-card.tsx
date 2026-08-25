'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { PreferredLanguage } from '@lezzet/types';
import { Button } from '@/components/customer/ui/button';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { errorText } from '@/lib/customer-error-text';
import { useRouter } from '@/i18n/navigation';
import type { AccountView } from '@/lib/account/read';
import { setPreferredLanguageAction } from '@/lib/identity/language-actions';
import { startWhatsappLinkAction, updateProfileAction } from '../actions';
import { Card } from '@/components/customer/ui/card';
import { CardHead, Row } from './account-cards';
import type { Messages } from '../account-types';

/**
 * Profil kartı — **satır içi düzenleme** (tasarım: "alan girişe dönüşür + Kaydet/Vazgeç; sayfa
 * değişmez"). Ayrı bir sayfa ya da modal DEĞİL: değiştirilecek şey üç alan, onları başka bir yere
 * taşımak bağlamı da taşımak olurdu.
 *
 * **E-posta okunur, düzenlenmez.** Kimliğin anahtarı: `user_profiles` benzersiz indeksi ve
 * `auth.users` bağı ondan geçiyor. Değiştirmek hesabı taşımaktır — doğrulama ve birleştirme
 * sorularını birlikte açar (04.7). Alanın yanında sebebi yazılı; gri bir kutu bırakıp müşteriyi
 * "neden basamıyorum" diye düşündürmek daha kötüydü.
 *
 * **Dil TEK bir şeydir** (30.07 · kullanıcı kararı): sitenin dili ile bildirimlerin dili aynı.
 * Footer'daki dil listesi de, buradaki hap da aynı kapıyı çağırır (`setPreferredLanguageAction`) ve
 * aynı anda sayfayı o dile götürür. Bir ara "site dili ayrı, bildirim dili ayrı" diye kurgulanmıştı
 * — müşteri için anlamsız bir ayrımdı: siteyi Türkçe gezen biri maillerinin Fransızca gelmesini
 * beklemez.
 *
 * Hap DÜZENLEME KİPİNİN ARKASINDA DEĞİL: tasarımda satır "Türkçe ▾" ve sözleşme "anında etkili"
 * diyor. Üç alanın ikisi için doğru olan kip, bu biri için fazladan iki tıklamaydı.
 */
interface ProfileCardProps {
  t: Messages;
  locale: Locale;
  profile: AccountView['profile'];
  /**
   * Doğrulanmış WhatsApp numaraları (04.10) — **salt okunur** ve olmak zorunda: bu değerler bir
   * KANITTIR (`customer_phone`), müşterinin yazdığı bir tercih değil. Düzenlenebilir olsaydı kanıt
   * olmaktan çıkardı.
   */
  whatsappNumbers: string[];
  compact: boolean;
}

const LANGUAGE_LABEL: Record<PreferredLanguage, string> = { tr: 'Türkçe', fr: 'Français', de: 'Deutsch' };

/**
 * Dil hapı — tasarımda "Türkçe ▾", yani satırın kendi açılır listesi.
 *
 * **Ham `<select>` bilinçli** (CLAUDE.md §2 "son çare"): kitin alan kabuğu (`FieldShell` +
 * `controlClass`) etiketli, `48px` sabit yükseklikte, tam genişlikte bir kutu verir — tasarımın
 * istediği şey satır içinde duran kompakt bir hap. Kiti zorlamak tasarımı bozardı. (Kitte bir de
 * saf `FormSelectField` duruyordu; hiç tüketilmemişti ve `bg-card` yerine hâlâ `bg-white` yazıyordu
 * — K4 · 02.08 ile silindi. Kitin bekleyen satır-içi ekseni: `design/BACKLOG §2`.)
 * Kutu tasarımın künyesiyle birebir: 1,5px kum-400 kenar, beyaz zemin, hap köşe.
 *
 * Ok işareti ayrı bir düğüm: `appearance-none` yerel oku kaldırıyor, tasarımın "▾"si onun yerine
 * geçiyor — üç tarayıcıda üç farklı ok çizilmesin.
 */
function LanguagePill({ locale, value, compact }: { locale: Locale; value: PreferredLanguage; compact: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /**
   * **Gösterilen değer AKTİF SAYFA DİLİDİR, karttaki değer değil** (30.07 · kullanıcı fark etti).
   *
   * Önce kart okunuyordu ve ekran kendi kendiyle çelişiyordu: sayfa Türkçe, hap "Français". Oysa
   * karar "dil TEKTİR" — sitenin dili ile bildirimlerin dili aynı şey. İkisinin ayrı görünebildiği
   * bir ekran, o kararı ekranda bozuyordu.
   *
   * Kart farklıysa (kayıt anındaki tohum `fr`, müşteri hiç seçim yapmamış) **sessizce hizalanır**:
   * ekranda "Türkçe" yazıp maili Fransızca göndermek, gösterdiğimiz şeyi uygulamamak olurdu.
   * Bu, "yalnız bağlantıya girmek yazmaz" kuralının istisnasıdır ve dar tutuluyor — burası
   * müşterinin KENDİ ayar sayfası, gelip geçilen bir içerik sayfası değil.
   */
  useEffect(() => {
    if (value !== locale) void setPreferredLanguageAction(locale);
  }, [value, locale]);

  return (
    <span className="relative inline-flex items-center">
      <select
        value={locale}
        disabled={pending}
        aria-label={LANGUAGE_LABEL[locale]}
        onChange={(e) => {
          const next = e.target.value as PreferredLanguage;
          if (next === locale) return;
          // Karta yaz + sayfayı o dile götür. İkisi AYNI eylemin iki yüzü; ayrı düşünülemezler.
          void setPreferredLanguageAction(next);
          if (next !== locale) startTransition(() => router.replace('/account', { locale: next }));
        }}
        className={[
          'cursor-pointer appearance-none rounded-pill border-[1.5px] border-sand-400 bg-card font-sans font-bold text-ink transition-colors hover:border-olive disabled:cursor-progress',
          compact ? 'py-1 pr-7 pl-3 text-micro' : 'py-1.5 pr-8 pl-3.5 text-note',
        ].join(' ')}
      >
        {Object.entries(LANGUAGE_LABEL).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className={['pointer-events-none absolute text-micro text-ink', compact ? 'right-2.5' : 'right-3'].join(' ')}>
        ▾
      </span>
    </span>
  );
}

/**
 * **WhatsApp'ımı bağla** (04.10) — hesabı müşterinin numarasına bağlayan akışın müşteri tarafı.
 *
 * Yaptığı şey görünenden daha az: bir bağlantı açıyor. Ama o bağlantının içindeki hazır mesaj iki
 * şeyi birden taşıyor — gönderen numara (zilyetlik kanıtı) ve jeton (hangi hesap). Müşteri
 * "gönder"e bastığında bağ kuruluyor; **biz hiçbir mesaj göndermiyoruz**, dolayısıyla şablon ücreti
 * de yok (DOMAIN §11).
 *
 * **Jeton tıklama ANINDA üretiliyor, sayfa çizilirken değil.** Sayfayı açan herkese peşin jeton
 * yazmak, hiç kullanılmayacak binlerce kısa ömürlü sır üretmek olurdu (`referral_code`ün "istek
 * üzerine üretilir" kuralının aynısı) — ve o jetonlar tekillik indeksinde birikirdi.
 *
 * `window.open` yerine gizli bir `<a>`: mobil tarayıcılarda `window.open` açılır-pencere engeline
 * takılabiliyor ve `wa.me` uygulamaya devrediliyor; kullanıcı hareketiyle tetiklenen bir bağlantı
 * her iki yüzeyde de aynı davranıyor.
 */
function WhatsappLinkButton({ t }: { t: Messages }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const { data, errorKey } = await startWhatsappLinkAction(t.whatsappLinkMessage);
    setBusy(false);
    if (errorKey || !data) return setError(errorText(t.errors, errorKey ?? 'unexpected'));
    window.open(data.href, '_blank', 'noopener,noreferrer');
  };

  return (
    <span className="inline-flex flex-col items-end gap-0.5 text-right">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark disabled:cursor-default disabled:opacity-60"
      >
        {busy ? t.whatsappLinkBusy : t.whatsappLinkCta}
      </button>
      <span className="font-sans text-micro font-normal leading-relaxed text-muted">{error ?? t.whatsappLinkHint}</span>
    </span>
  );
}

export function ProfileCard({ t, locale, profile, whatsappNumbers, compact }: ProfileCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = () => {
    // Form her açılışta SUNUCUDAKİ değerle kurulur: bir önceki vazgeçilen düzenlemenin artığı
    // kalırsa müşteri kaydetmediği bir şeyi kaydetmiş sanır.
    setName(profile.name);
    setPhone(profile.phone ?? '');
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const { errorKey } = await updateProfileAction({ name, phone });
    setBusy(false);
    // Cümle EKRANDA kurulur (denetim H1/H2): sunucu anahtar döner, sözlük burada. Bilinmeyen bir
    // anahtar gelirse jenerik cümleye düşeriz — ekran asla boş kalmaz.
    if (errorKey) return setError(errorText(t.errors, errorKey));
    setEditing(false);
  };

  if (!editing) {
    return (
      <Card compact={compact}>
        <CardHead
          title={t.profileTitle}
          compact={compact}
          action={
            <button type="button" onClick={open} className="flex-none cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark">
              {t.edit}
            </button>
          }
        />
        <Row label={t.name} value={profile.name || '—'} />
        <Row label={t.email} value={profile.email ?? '—'} />
        {/* ── İKİ AYRI TELEFON, İKİ AYRI SATIR (04.10 · kullanıcı bulgusu 25.08) ────────────────
            Bu satır bir tur "Telefon (WhatsApp)" diyordu ve müşteriye YANLIŞ söz veriyordu: kutu
            serbest metindi, WhatsApp kimliğiyle hiçbir ilgisi yoktu. Gerçekte iki ayrı şey var ve
            her birinin kendi tüketicisi:
              · İletişim numarası → `addressDefaultsOf`, yeni adres formunun önerdiği numara
              · WhatsApp numarası → kimlik anahtarı; yalnız müşteri bize yazınca doğar
            Tek satıra sıkıştırmak, kuryenin çalacağı numara ile bizi tanıdığımız numarayı aynı şey
            sanmaya yol açıyordu. Ayrıldılar. */}
        <Row label={t.phone} value={profile.phone ?? t.noPhone} />
        <Row
          label={t.whatsappLabel}
          value={
            whatsappNumbers.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="truncate">{whatsappNumbers.join(' · ')}</span>
                <span className="flex-none font-sans text-micro font-semibold text-olive">{t.whatsappVerified}</span>
              </span>
            ) : (
              <WhatsappLinkButton t={t} />
            )
          }
        />
        {/* Dil DÜZENLEME KİPİNİN ARKASINDA DEĞİL: tasarımda satır "Türkçe ▾" — kendi başına bir
            açılır liste ve etkileşim sözleşmesi "anında etkili" diyor. Bir süre "Düzenle"nin
            ardına konmuştu; üç alanın ikisi için doğru olan kip, bu biri için fazladan iki tıklama
            demekti (30.07 kullanıcı geri bildirimi). */}
        <Row label={t.language} value={<LanguagePill locale={locale} value={profile.preferredLanguage} compact={compact} />} />
      </Card>
    );
  }

  return (
    <Card compact={compact}>
      <CardHead title={t.profileTitle} compact={compact} />
      <div className="flex flex-col gap-3">
        <FormInputField label={t.name} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        {/* Alanın NE İŞE YARADIĞI altında yazılı (04.10). Etiket bir tur "Telefon (WhatsApp)" idi
            ve müşteriye tutamayacağımız bir söz veriyordu — burada yazılan numara WhatsApp kimliği
            kurmuyor, adres formuna öneri olarak gidiyor. Alanın gerekçesini söylemek, onu
            kaldırmaktan iyi: gerçekten bir işi var ve o iş her adres eklemede görünüyor. */}
        <div className="flex flex-col gap-1">
          <FormInputField
            label={t.phoneWhatsapp}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+33 6 12 34 56 78"
          />
          <span className="font-sans text-micro leading-relaxed text-muted">{t.phoneHint}</span>
        </div>

        {/* E-posta neden düzenlenemiyor, ORADA yazılı: pasif bir alan bırakıp sebebi söylememek
            müşteriyi kendi hatasını arar hâlde bırakır. */}
        <div className="flex flex-col gap-1">
          <span className="font-sans text-micro text-muted">{t.email}</span>
          <span className="font-sans text-body-sm font-bold text-ink">{profile.email ?? '—'}</span>
          <span className="font-sans text-micro leading-relaxed text-muted">{t.emailLocked}</span>
        </div>

        {/* Dil BURADA YOK: kendi denetimi var ve düzenleme kipini beklemiyor (yukarıya bak).
            İki yerde birden olması, hangisinin geçerli olduğunu sordururdu. */}

        {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}

        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy || !name.trim()} onClick={() => void save()}>
            {busy ? t.saving : t.save}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
            {t.cancel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
