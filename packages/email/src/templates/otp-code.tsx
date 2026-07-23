import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components';
import type { Locale } from '@lezzet/i18n';

// Klasik JSX runtime'lı araçlarda (render script'leri, esbuild) React kapsamda olmalı;
// otomatik runtime'da (Next/SWC) bu import kullanılmaz. `void` → noUnusedLocals susar.
void React;

export interface OtpCodeEmailProps {
  /** 6-haneli plain kod (örn. "482917"). DB'de yalnız SHA-256 hash saklanır. */
  code: string;
  locale: Locale;
  brandName: string;
  /** Kod geçerlilik süresi (dakika). */
  ttlMinutes?: number;
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

/** Giriş kodu maili için konu başlığı (seçili dilde). */
export function otpSubject(locale: Locale, brandName: string): string {
  const map: Record<Locale, string> = {
    tr: `${brandName} giriş kodunuz`,
    fr: `Votre code ${brandName}`,
    de: `Ihr ${brandName} Code`,
  };
  return map[locale];
}

/**
 * Passwordless giriş için 6-haneli kod maili. Link İÇERMEZ (anti-phishing): kod,
 * kullanıcının zaten açık olduğu /connexion sayfasına elle girilir. İçerik seçili dilde.
 */
export function OtpCodeEmail({ code, locale, brandName, ttlMinutes = 15 }: OtpCodeEmailProps) {
  const t = COPY[locale];

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
