import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components';
import type { Locale } from '@lezzet/i18n';

// Klasik JSX runtime'lı araçlarda (render script'leri, esbuild) React kapsamda olmalı;
// otomatik runtime'da (Next/SWC) bu import kullanılmaz. `void` → noUnusedLocals susar.
void React;

/**
 * Kodun NE İÇİN olduğu — kabuk aynı, CÜMLE farklı (04.10).
 *
 * `login`  → tarayıcıda açık duran `/connexion` sayfasına girilir.
 * `anchor` → **WhatsApp sohbetine geri yazılır** (kimlik çapası): kod e-postaya gider, cevap
 *            başka bir kanaldan döner ve kanıtın gücü tam olarak o çaprazlıktan gelir (DOMAIN §10).
 *
 * Ayrı bir şablon dosyası AÇILMADI (CLAUDE §1): görsel kabuk birebir aynı, ayrışan yalnız metin.
 * İki dosya olsaydı marka rengi bir gün birinde değişir, ötekinde kalırdı. Ama tek metinle de
 * yapılamazdı: giriş maili *"tarayıcınızda açık sayfaya girin"* diyor ve çapa kodunda bu cümle
 * DÜPEDÜZ YANLIŞ — müşteri açık bir sayfa aramaya başlardı.
 */
export type OtpCodePurpose = 'login' | 'anchor';

export interface OtpCodeEmailProps {
  /** 6-haneli plain kod (örn. "482917"). DB'de yalnız SHA-256 hash saklanır. */
  code: string;
  locale: Locale;
  brandName: string;
  /** Kod geçerlilik süresi (dakika). */
  ttlMinutes?: number;
  /** Kodun ne için olduğu — varsayılan giriş (mevcut tek çağıranın davranışı korunur). */
  purpose?: OtpCodePurpose;
}

type Copy = { heading: string; intro: string; expires: (m: number) => string; ignore: string };

const COPY: Record<Locale, Copy> = {
  tr: {
    heading: 'Giriş kodunuz',
    intro: 'Tarayıcınızda açık sayfaya girmeniz için tek kullanımlık kodunuz:',
    expires: (m) => `seçmek için dokunun · ${m} dakika geçerli`,
    ignore: 'Bu girişi siz başlatmadıysanız bu mesajı yok sayabilirsiniz — hesabınızda bir işlem yapılmaz.',
  },
  fr: {
    heading: 'Votre code de connexion',
    intro: 'Voici votre code à usage unique. Saisissez-le sur la page ouverte dans votre navigateur :',
    expires: (m) => `appuyez pour sélectionner · expire dans ${m} minutes`,
    ignore: 'Si vous n’êtes pas à l’origine de cette connexion, ignorez ce message — aucune action ne sera effectuée.',
  },
  de: {
    heading: 'Ihr Anmeldecode',
    intro: 'Hier ist Ihr Einmalcode. Geben Sie ihn auf der geöffneten Seite in Ihrem Browser ein:',
    expires: (m) => `zum Auswählen tippen · gültig für ${m} Minuten`,
    ignore: 'Falls Sie diese Anmeldung nicht veranlasst haben, ignorieren Sie diese Nachricht — es wird nichts unternommen.',
  },
};

/**
 * Kimlik ÇAPASI metni (04.10) — kod WhatsApp sohbetine geri yazılır.
 *
 * Cümle bunu açıkça söylüyor, çünkü müşteri bu maili **başka bir uygulamadayken** alıyor ve nereye
 * yazacağını bilmesi gerekiyor. "Tarayıcınızda açık sayfa" cümlesi burada onu boş yere aratırdı.
 */
const ANCHOR_COPY: Record<Locale, Copy> = {
  tr: {
    heading: 'Hesap bağlama kodunuz',
    intro: 'Bu kodu bize WhatsApp’tan yazın — hesabınız numaranıza bağlansın:',
    expires: (m) => `seçmek için dokunun · ${m} dakika geçerli`,
    ignore: 'Bu isteği siz yapmadıysanız bu mesajı yok sayabilirsiniz — hiçbir bağlama yapılmaz.',
  },
  fr: {
    heading: 'Votre code de rattachement',
    intro: 'Renvoyez-nous ce code sur WhatsApp pour rattacher votre compte à votre numéro :',
    expires: (m) => `appuyez pour sélectionner · expire dans ${m} minutes`,
    ignore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message — aucun rattachement ne sera effectué.',
  },
  de: {
    heading: 'Ihr Verknüpfungscode',
    intro: 'Senden Sie uns diesen Code auf WhatsApp zurück, um Ihr Konto mit Ihrer Nummer zu verknüpfen:',
    expires: (m) => `zum Auswählen tippen · gültig für ${m} Minuten`,
    ignore: 'Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese Nachricht — es wird nichts verknüpft.',
  },
};

/** Kod maili için konu başlığı (seçili dilde, amaca göre). */
export function otpSubject(locale: Locale, brandName: string, purpose: OtpCodePurpose = 'login'): string {
  const map: Record<OtpCodePurpose, Record<Locale, string>> = {
    login: {
      tr: `${brandName} giriş kodunuz`,
      fr: `Votre code ${brandName}`,
      de: `Ihr ${brandName} Code`,
    },
    anchor: {
      tr: `${brandName} hesap bağlama kodunuz`,
      fr: `Votre code de rattachement ${brandName}`,
      de: `Ihr ${brandName} Verknüpfungscode`,
    },
  };
  return map[purpose][locale];
}

/**
 * Passwordless giriş için 6-haneli kod maili. Link İÇERMEZ (anti-phishing): kod,
 * kullanıcının zaten açık olduğu /connexion sayfasına elle girilir. İçerik seçili dilde.
 */
export function OtpCodeEmail({ code, locale, brandName, ttlMinutes = 15, purpose = 'login' }: OtpCodeEmailProps) {
  const t = purpose === 'anchor' ? ANCHOR_COPY[locale] : COPY[locale];

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{`${brandName}: ${code}`}</Preview>
      <Body style={{ margin: 0, backgroundColor: '#e9e6df', fontFamily: "Georgia, 'Times New Roman', serif" }}>
        <Container style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px' }}>
          <Section style={{ backgroundColor: '#faf6ec', borderRadius: 20, padding: '36px 32px' }}>
            <Text style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#5f7a2c', letterSpacing: '-0.01em' }}>{brandName}</Text>

            <Heading as="h1" style={{ margin: '18px 0 0', fontSize: 28, lineHeight: 1.1, color: '#343b41', fontWeight: 600 }}>
              {t.heading}
            </Heading>

            <Text style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.6, color: '#6d7261' }}>{t.intro}</Text>

            <Section style={{ margin: '28px 0', textAlign: 'center' }}>
              <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', margin: '0 auto' }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        background: '#ffffff',
                        border: '1px solid #d8cfb6',
                        borderRadius: 14,
                        padding: '22px 30px',
                        textAlign: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                          fontSize: 42,
                          fontWeight: 700,
                          letterSpacing: '0.3em',
                          color: '#22251f',
                          lineHeight: 1,
                          paddingLeft: '0.15em',
                          userSelect: 'all',
                          WebkitUserSelect: 'all',
                        }}
                      >
                        {code}
                      </span>
                      <div
                        style={{
                          marginTop: 12,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          color: '#8a8270',
                        }}
                      >
                        {t.expires(ttlMinutes)}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Text style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#8a8270' }}>{t.ignore}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
