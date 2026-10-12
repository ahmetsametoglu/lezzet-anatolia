import * as React from 'react';
import { Head, Html, Preview } from '@react-email/components';
import type { NotificationLine, NotificationStep, NotificationTotal, PreferredLanguage } from '@lezzet/types';

// Klasik JSX runtime'lı araçlarda React kapsamda olmalı (bkz. otp-code.tsx).
void React;

/**
 * Bütün e-postaların ortak iskeleti ve blokları; tasarım `design/08-export/Email - *.html`. Mail istemcileri web fontu yüklemediği
 * ve Outlook flexbox bilmediği için yazı sistem fontuyla, düzen satır içi stilli sunum tablolarıyla kurulur.
 */

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = 'Arial,Helvetica,sans-serif';

/** Gövde satırının yatay dolgusu; `Row`, başlık ve alt bilgi aynı değeri kullanır. */
const ROW_INSET = 32;

/**
 * Tasarımın dar ekran kuralı: kap ekrana sığar, satır dolgusu daralır. Kural yoksa 600 px'lik kap telefonda taşar ve Gmail
 * uygulaması e-postayı kendisi sığdırırken tabloların genişliğini bozar.
 */
const NARROW_SCREEN_CSS =
  '@media only screen and (max-width:620px){.wrap{width:100% !important;}.pad{padding-left:20px !important;padding-right:20px !important;}}';

/** Metnin sayfa kenarından uzaklığı; bütün bloklar metni bu tek kenardan başlatır, yoksa okurken sol kenar bloktan bloğa zıplar. */
const TEXT_INSET = 57;

/** Bir bloğun iç yatay dolgusu: ortak hizadan satır dolgusu, bloğun kenarlığı ve varsa sol vurgu şeridi düşülür. */
const innerX = (border: number, stripe = 0): number => TEXT_INSET - ROW_INSET - border - stripe;

/** Tasarım paleti; mailde CSS değişkeni çalışmadığı için sabittir. */
const C = {
  page: '#e9e6df',
  card: '#faf6ec',
  border: '#e6dfcd',
  white: '#ffffff',
  innerBorder: '#ece5d2',
  cream: '#f0e9d6',
  ink: '#343b41',
  strong: '#3a4147',
  muted: '#6d7261',
  faint: '#8a8270',
  pale: '#b3ab97',
  green: '#5f7a2c',
  greenSoft: '#eef2e2',
  rule: '#f0ead9',
  pendingRule: '#e0d8c2',
  footerText: '#9a917c',
} as const;

interface OrderEmailFooter {
  /** "Lezzet Anatolie · 46 rue des Prés, 67380 Lingolsheim, France" — şirket künyesinden (`notify`). */
  address: string;
  /** "Bu e-posta LZA-2451 numaralı siparişinizle ilgili gönderilmiştir." */
  notice: string;
  preferencesLabel: string;
  preferencesUrl: string;
}

interface EmailLayoutProps {
  preview: string;
  locale: PreferredLanguage;
  brandName: string;
  /** Başlığın sağındaki küçük bölge etiketi ("Strasbourg & çevresi"). */
  region: string;
  footer: OrderEmailFooter;
  children: React.ReactNode;
}

export function EmailLayout({ preview, locale, brandName, region, footer, children }: EmailLayoutProps) {
  return (
    <Html lang={locale}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{NARROW_SCREEN_CSS}</style>
      </Head>
      <Preview>{preview}</Preview>
      <body style={{ margin: 0, padding: 0, backgroundColor: C.page }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.page }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '36px 16px' }}>
                <table
                  className="wrap"
                  role="presentation"
                  width={600}
                  cellPadding={0}
                  cellSpacing={0}
                  border={0}
                  style={{ width: 600, maxWidth: 600, backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 20 }}
                >
                  <tbody>
                    <tr>
                      <td className="pad" style={{ padding: `22px ${ROW_INSET}px`, borderBottom: `1px solid ${C.border}` }}>
                        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
                          <tbody>
                            <tr>
                              <td valign="middle" style={{ fontFamily: SERIF, fontSize: 21, lineHeight: '26px', color: C.ink, letterSpacing: '.01em' }}>
                                {brandName}
                              </td>
                              <td
                                valign="middle"
                                align="right"
                                style={{
                                  fontFamily: SANS, fontSize: 10.5, lineHeight: '16px', fontWeight: 'bold',
                                  letterSpacing: '.09em', textTransform: 'uppercase', color: C.faint,
                                }}
                              >
                                {region}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {children}

                    <tr>
                      <td
                        className="pad"
                        style={{
                          backgroundColor: C.cream,
                          padding: `22px ${ROW_INSET}px`,
                          borderTop: `1px solid ${C.border}`,
                          borderRadius: '0 0 20px 20px',
                          fontFamily: SANS,
                          fontSize: 11.5,
                          lineHeight: '19px',
                          color: C.footerText,
                        }}
                      >
                        {footer.address}
                        <br />
                        {`${footer.notice} `}
                        <a href={footer.preferencesUrl} style={{ color: C.faint, textDecoration: 'underline' }}>
                          {footer.preferencesLabel}
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </Html>
  );
}

/** Gövde satırı — iskeletin `children`'ı hep `<tr>` olmalı; dolgu tek yerden verilir. */
function Row({ children, top, bottom }: { children: React.ReactNode; top: number; bottom: number }) {
  // Yatay dolgu prop değildir, çünkü blokların hizası ondan türetilir; dikey dolgu bloğun ritmidir.
  return (
    <tr>
      <td className="pad" style={{ padding: `${top}px ${ROW_INSET}px ${bottom}px` }}>
        {children}
      </td>
    </tr>
  );
}

/** Durum tonu: akış bildirimleri yeşil, istisna bildirimleri kendi renginde (iptal kiremit, eksik karşılanma amber), çünkü mailin ilk okunan hâli renktir. */
type StatusTone = 'green' | 'red' | 'amber';

const TONE: Record<StatusTone, { soft: string; ink: string; border: string }> = {
  green: { soft: C.greenSoft, ink: C.green, border: C.innerBorder },
  red: { soft: '#f6e6e1', ink: '#9a4b3c', border: '#e7cfc7' },
  amber: { soft: '#f7ecd8', ink: '#8a6b2a', border: '#ecd9b4' },
};

/** Durum hapı — "✓ Sipariş onaylandı", "● Yolda", "✕ Sipariş iptal edildi". */
export function StatusPill({ label, tone = 'green' }: { label: string; tone?: StatusTone }) {
  const colors = TONE[tone];
  return (
    <Row top={32} bottom={0}>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: colors.soft, borderRadius: 14, padding: '6px 14px',
                fontFamily: SANS, fontSize: 12.5, lineHeight: '16px', fontWeight: 'bold', color: colors.ink,
              }}
            >
              {label}
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  );
}

/**
 * Tek durum bloğu — **istisna bildirimlerinde zaman çizgisinin yerini alır** (tasarım kuralı:
 * iptal/iade halinde çizgi yerine tek durum bloğu). Soldaki 4px renk şeridi tonu taşır.
 */
export function StatusBlock({ tone, headline, detail }: { tone: StatusTone; headline: string; detail: React.ReactNode }) {
  const colors = TONE[tone];
  return (
    <Row top={0} bottom={18}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.white, border: `1px solid ${colors.border}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            {/* Şeridin 4 px'i `innerX`e bildirilir, yoksa bu bloğun metni komşularından o kadar sağda başlar. */}
            <td width={4} style={{ width: 4, backgroundColor: colors.ink, fontSize: 0, lineHeight: 0 }}>
              &nbsp;
            </td>
            <td style={{ padding: `18px ${innerX(1, 4)}px` }}>
              <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: '20px', fontWeight: 'bold', color: colors.ink }}>{headline}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: '20px', color: C.muted, paddingTop: 5 }}>{detail}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  );
}

/** Ana başlık + altındaki giriş metni. `intro` içinde referans kalın gösterilir. */
export function Headline({ title, intro }: { title: string; intro: React.ReactNode }) {
  return (
    <>
      <Row top={14} bottom={0}>
        <div style={{ fontFamily: SERIF, fontSize: 29, lineHeight: '36px', color: C.ink }}>{title}</div>
      </Row>
      <Row top={10} bottom={22}>
        <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: '22px', color: C.muted }}>{intro}</div>
      </Row>
    </>
  );
}

/** Künyenin soluk ikincil satırı. */
const META_TEXT = { fontFamily: SANS, fontSize: 12.5, lineHeight: '18px', color: C.faint } as const;

/**
 * Künye satırı, kartın kutusuz kardeşi: künye haber değil etikettir ve dar ekranda asıl haberin önünde tam bir blok kaplamamalı.
 * Durum hapı yoktur, çünkü durumu üstteki `StatusPill` söyler.
 */
export function MetaLine({ text }: { text: string }) {
  return (
    <Row top={0} bottom={20}>
      <div style={META_TEXT}>{text}</div>
    </Row>
  );
}


/** Künye kartı: başlık, soluk ikincil satır ve sağda durum hapı; "hangi kayıt, ne zaman, şu an ne durumda" sorusunu cevaplar. */
export function HeaderCard({
  title,
  meta,
  statusLabel,
  metaBelow = false,
}: {
  title: string;
  meta: string;
  statusLabel: string;
  /** İkincil satır başlığın altında; uzun başlık hapı sıkıştırmasın diye. */
  metaBelow?: boolean;
}) {
  return (
    <Row top={0} bottom={18}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.white, border: `1px solid ${C.innerBorder}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: `18px ${innerX(1)}px` }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td valign="middle" style={{ fontFamily: SERIF, fontSize: 22, lineHeight: '28px', color: C.ink }}>
                      {title}
                      {metaBelow ? (
                        <div style={META_TEXT}>{meta}</div>
                      ) : (
                        <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 'normal', color: C.faint }}>{`\u00A0\u00A0${meta}`}</span>
                      )}
                    </td>
                    <td valign="middle" align="right">
                      <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                        <tbody>
                          <tr>
                            <td style={{ backgroundColor: C.greenSoft, borderRadius: 13, padding: '5px 13px', fontFamily: SANS, fontSize: 12, lineHeight: '16px', fontWeight: 'bold', color: C.green }}>
                              {statusLabel}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  );
}

/**
 * Dört adımlı zaman çizgisi. Adımın hâli üç görünüm verir: dolu yeşil daire (`done`), içi dolu
 * nokta (`current`), boş halka (`pending`) — bağlayıcı çizgi de aynı mantıkla renklenir.
 */
export function Timeline({ steps, labels }: { steps: readonly NotificationStep[]; labels: Record<NotificationStep['key'], string> }) {
  return (
    <Row top={0} bottom={18}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.white, border: `1px solid ${C.innerBorder}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: `22px ${innerX(1)}px` }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
                <tbody>
                  {steps.map((step, index) => {
                    const reached = step.state !== 'pending';
                    const last = index === steps.length - 1;
                    return (
                      <tr key={step.key}>
                        <td width={36} valign="top" style={{ width: 36, padding: 0 }}>
                          <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width={22} style={{ width: 22 }}>
                            <tbody>
                              <tr>
                                <td
                                  width={22}
                                  height={22}
                                  align="center"
                                  valign="middle"
                                  style={{
                                    width: 22, height: 22, borderRadius: 11,
                                    backgroundColor: reached ? C.green : C.card,
                                    border: reached ? 0 : `2px solid ${C.pendingRule}`,
                                    fontFamily: SANS, fontSize: 11, fontWeight: 'bold', lineHeight: '22px', color: C.white,
                                  }}
                                >
                                  {step.state === 'done' ? '✓' : step.state === 'current' ? '●' : ' '}
                                </td>
                              </tr>
                              {!last && (
                                <tr>
                                  <td align="center" style={{ padding: 0 }}>
                                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width={2} style={{ width: 2 }}>
                                      <tbody>
                                        <tr>
                                          <td width={2} height={26} style={{ width: 2, height: 26, backgroundColor: reached ? C.green : C.pendingRule, fontSize: 0, lineHeight: 0 }}>
                                            &nbsp;
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                        <td valign="top" style={{ padding: last ? 0 : '0 0 14px', fontFamily: SANS }}>
                          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 'bold', lineHeight: '20px', color: reached ? C.strong : C.pale }}>
                            {labels[step.key]}
                          </div>
                          <div style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: '18px', color: C.faint, paddingTop: 2 }}>{step.detail ?? ''}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  );
}

/** Krem bilgi kutusu — teslimat penceresi / kurye saati. */
export function InfoBlock({ icon, headline, detail }: { icon: string; headline: string; detail: React.ReactNode }) {
  return (
    <Row top={0} bottom={18}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.cream, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: `18px ${innerX(0)}px` }}>
              <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: '21px', fontWeight: 'bold', color: C.strong }}>{`${icon} ${headline}`}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: '20px', color: C.muted, paddingTop: 4 }}>{detail}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  );
}

/** Beyaz kart kabuğu — başlıklı içerik blokları (kalemler, tutar, özet) bunun içinde durur. */
function Card({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <Row top={0} bottom={18}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.white, border: `1px solid ${C.innerBorder}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: `20px ${innerX(1)}px` }}>
              {title && <div style={{ fontFamily: SERIF, fontSize: 18, lineHeight: '24px', color: C.ink, paddingBottom: 10 }}>{title}</div>}
              {children}
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  );
}

/**
 * Kalem listesi. Sağ sütun iki türlü doldurulur: onayda tutar, yolda giden ADET — tasarım
 * "gönderilen kalemler"de fiyat göstermez, çünkü orada soru "ne geldi", "ne kadar tuttu" değil.
 */
export function ItemsCard({ title, lines }: { title: string; lines: readonly NotificationLine[] }) {
  return (
    <Card title={title}>
      {lines.map((line, index) => (
        <table
          key={`${line.name}-${index}`}
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ width: '100%', borderTop: index === 0 ? undefined : `1px solid ${C.rule}` }}
        >
          <tbody>
            <tr>
              <td valign="top" style={{ padding: '10px 0', fontFamily: SANS, fontSize: 14, lineHeight: '20px', fontWeight: 'bold', color: C.strong }}>
                {line.name}
                {line.meta && (
                  <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 'normal', lineHeight: '17px', color: C.faint, paddingTop: 3 }}>{line.meta}</div>
                )}
              </td>
              <td valign="top" align="right" width={110} style={{ width: 110, whiteSpace: 'nowrap', padding: '10px 0', fontFamily: SANS, fontSize: 13.5, lineHeight: '20px', color: C.muted }}>
                <strong style={{ color: C.strong }}>{line.amount ?? `${line.qty}`}</strong>
              </td>
            </tr>
            {line.shortfall && (
              <tr>
                <td colSpan={2} style={{ paddingBottom: 10 }}>
                  <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: '#fdf3e2', borderRadius: 10 }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '10px 14px', fontFamily: SANS, fontSize: 12.5, lineHeight: '18px', color: '#8a6b2f' }}>{line.shortfall}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ))}
    </Card>
  );
}

/** Tutar kartı: satırlar + kalın genel toplam + ödeme hapı. */
export function TotalsCard({
  title,
  totals,
  grandTotal,
  paymentNote,
  footnote,
}: {
  title: string;
  totals: readonly NotificationTotal[];
  grandTotal: { label: string; value: string } | null;
  paymentNote: string | null;
  /** Kartın altındaki küçük açıklama — iade süresi, tahsilat yönü (istisna bildirimleri). */
  footnote?: string | null;
}) {
  return (
    <Card title={title}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
        <tbody>
          {totals.map((total) => (
            <tr key={total.label}>
              <td style={{ padding: '6px 0', fontFamily: SANS, fontSize: 14, lineHeight: '20px', color: total.positive ? C.green : C.muted }}>{total.label}</td>
              <td align="right" style={{ padding: '6px 0', fontFamily: SANS, fontSize: 14, lineHeight: '20px', fontWeight: 'bold', color: total.positive ? C.green : C.strong }}>
                {total.value}
              </td>
            </tr>
          ))}
          {grandTotal && (
            <tr>
              <td style={{ padding: '12px 0 6px', fontFamily: SANS, fontSize: 14, lineHeight: '20px', color: C.ink, borderTop: `1px solid ${C.innerBorder}` }}>{grandTotal.label}</td>
              <td align="right" style={{ padding: '12px 0 6px', fontFamily: SANS, fontSize: 16, lineHeight: '20px', fontWeight: 'bold', color: C.ink, borderTop: `1px solid ${C.innerBorder}` }}>
                {grandTotal.value}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {footnote && <div style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: '19px', color: C.faint, paddingTop: 10 }}>{footnote}</div>}
      {paymentNote && (
        <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ marginTop: 14 }}>
          <tbody>
            <tr>
              <td style={{ backgroundColor: C.greenSoft, borderRadius: 12, padding: '6px 12px', fontFamily: SANS, fontSize: 12.5, lineHeight: '16px', fontWeight: 'bold', color: C.green }}>
                {paymentNote}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </Card>
  );
}

/**
 * Fiyatsız kalem listesi — iptalde "iptal edilen kalemler", eksik karşılanmada "tam gönderilenler".
 * Fiyat yoktur: o mailde soru "ne kadar tuttu" değil, "hangi ürünler" olduğudur.
 */
export function PlainListCard({ title, lines }: { title: string; lines: readonly NotificationLine[] }) {
  return (
    <Card title={title}>
      <div style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: '22px', color: C.muted }}>
        {lines.map((line, index) => (
          <React.Fragment key={`${line.name}-${index}`}>
            {index > 0 && <br />}
            {`${line.name} · ${line.qty}`}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
}

/** Teslimat özeti kartı — yalnız teslim mailinde; "resmî fatura değildir" ibaresi ZORUNLU. */
export function SummaryCard({
  title,
  countLabel,
  amount,
  note,
  linkLabel,
  linkUrl,
}: {
  title: string;
  countLabel: string;
  amount: string;
  note: string;
  linkLabel: string;
  linkUrl: string;
}) {
  return (
    <Card title={title}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ fontFamily: SANS, fontSize: 14, lineHeight: '20px', color: C.muted }}>{countLabel}</td>
            <td align="right" style={{ fontFamily: SANS, fontSize: 16, lineHeight: '20px', fontWeight: 'bold', color: C.ink }}>
              {amount}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: '18px', color: C.faint, paddingTop: 10 }}>{note}</div>
      <div style={{ paddingTop: 12 }}>
        <a href={linkUrl} style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 'bold', color: C.green, textDecoration: 'none' }}>
          {linkLabel}
        </a>
      </div>
    </Card>
  );
}

/**
 * Yazışma kartı: personelin cevabı kırpılmadan ve satır sonlarıyla çizilir, çünkü mail cevabı taşımak için gider. Başlık art arda
 * gelen kartlarda yalnız ilkinde yazılır (`null`); gövde, biçimli metin çizilebilsin diye düğümdür.
 */
export function MessageCard({ title, meta, body }: { title: string | null; meta: string | null; body: React.ReactNode }) {
  return (
    <Card title={title}>
      {meta && <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: '17px', color: C.faint, paddingBottom: 8 }}>{meta}</div>}
      <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: '22px', color: C.strong, whiteSpace: 'pre-line' }}>{body}</div>
    </Card>
  );
}

/** Alıntılanan tek mesaj — kim, ne zaman, ne yazdı. Ticket kavramı taşımaz: etiketi çağıran verir. */
export interface EmailQuote {
  author: string;
  at: string;
  /** Düğüm, dize değil — gerekçe `MessageCard`ın künyesinde: alıntı da biçimli çizilir. */
  body: React.ReactNode;
  /** Gövde kırpıldıysa altına düşen dürüstlük satırı; kırpılmadıysa null. */
  note?: string | null;
}

/**
 * Alıntılanan yazışma: mailin konusu olan mesajın altındaki bağlam; kutusuzdur ve sol çizgi, küçük punto, soluk renkle yeni
 * mesajdan ayrılır. Sıra en yeniden eskiye, çünkü müşteri en son ne konuşulduğunu arar.
 */
export function QuoteCard({ title, entries }: { title: string; entries: readonly EmailQuote[] }) {
  return (
    <Row top={4} bottom={22}>
      <div style={{ fontFamily: SERIF, fontSize: 16, lineHeight: '22px', color: C.muted, paddingBottom: 10 }}>{title}</div>
      {entries.map((entry, index) => (
        <table
          key={`${entry.at}-${index}`}
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ width: '100%', borderTop: index === 0 ? undefined : `1px solid ${C.rule}` }}
        >
          <tbody>
            <tr>
              {/* Alıntının kutusu yok; hizayı kendi 2 px'lik şeridinden türetir. */}
              <td
                style={{
                  padding: index === 0 ? `0 0 12px ${innerX(2)}px` : `12px 0 12px ${innerX(2)}px`,
                  borderLeft: `2px solid ${C.pendingRule}`,
                }}
              >
                <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: '17px', color: C.faint, paddingBottom: 4 }}>
                  <strong style={{ color: C.muted }}>{entry.author}</strong> · {entry.at}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: '20px', color: C.muted, whiteSpace: 'pre-line' }}>{entry.body}</div>
                {entry.note && <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: '17px', color: C.pale, paddingTop: 4 }}>{entry.note}</div>}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </Row>
  );
}

/** Yeşil hap buton — her mailde tek birincil eylem. */
export function CtaButton({ label, url }: { label: string; url: string }) {
  return (
    <Row top={2} bottom={26}>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          <tr>
            <td align="center" style={{ backgroundColor: C.green, borderRadius: 24 }}>
              <a
                href={url}
                style={{ display: 'block', padding: '14px 30px', fontFamily: SANS, fontSize: 14, lineHeight: '18px', fontWeight: 'bold', color: C.white, textDecoration: 'none', borderRadius: 24 }}
              >
                {label}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  );
}

/**
 * Krem ikincil kart: serif başlık, açıklama ve isteğe bağlı bağlantı ("Bir sorun mu var?"). Beyaz kartlardan tonuyla ayrılır,
 * çünkü bilgi değil davettir ve birincil eylemle yarışmaz.
 */
export function NoticeCard({ title, text, linkLabel, linkUrl }: { title: string; text: string; linkLabel?: string | null; linkUrl?: string | null }) {
  return (
    <Row top={0} bottom={18}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.cream, border: `1px solid ${C.cream}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: `18px ${innerX(1)}px` }}>
              <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: '23px', color: C.ink }}>{title}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: '20px', color: C.muted, padding: linkLabel ? '6px 0 12px' : '6px 0 0' }}>{text}</div>
              {linkLabel && linkUrl && (
                <a href={linkUrl} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 'bold', color: C.green, textDecoration: 'none' }}>
                  {linkLabel}
                </a>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  );
}

