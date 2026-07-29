import * as React from 'react';
import { Head, Html, Preview } from '@react-email/components';
import type { NotificationLine, NotificationStep, NotificationTotal, PreferredLanguage } from '@lezzet/types';

// Klasik JSX runtime'lı araçlarda React kapsamda olmalı (bkz. otp-code.tsx).
void React;

/**
 * TÜM e-postaların ortak iskeleti ve blokları — `design/project/Email - *.html` birebir.
 *
 * Sipariş mailleri (onay / yolda / teslim / iptal / iade / eksik) ve talep mailleri aynı gövdeyi
 * paylaşır; farkları doldurdukları bloklardır. Ortak iskelet olmasaydı başlık ve alt bilgi her
 * şablonda ayrı dururdu — biri değişince ötekiler eskirdi. **Talep mailinin ayrı bir çizimi yok**
 * (`design/project`'te `Email - Talep` yok); marka iskeleti aynen kullanılır, uydurulmaz.
 *
 * **Tasarımın iki bağlayıcı kararı burada uygulanır:**
 * - **Web fontu yok.** Lora yerine Georgia, Karla yerine Arial. Mail istemcileri web fontu
 *   yüklemez; hiyerarşi ölçü ve ağırlıkla korunur.
 * - **Tablo düzeni + inline stil.** Outlook flexbox/grid bilmez; `<div>` ile kurulan kart orada
 *   dağılır. Bu yüzden `role="presentation"` tablolar — sunum tablosu, veri tablosu değil.
 */

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = 'Arial,Helvetica,sans-serif';

/** Tasarım paleti (`design/project/Email - *.html`) — mailde CSS değişkeni çalışmaz, sabit gerekir. */
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
  /** "Lezzet Anatolia · 12 Rue du Marché, 67000 Strasbourg, Fransa" */
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
      <Head />
      <Preview>{preview}</Preview>
      <body style={{ margin: 0, padding: 0, backgroundColor: C.page }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.page }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '36px 16px' }}>
                <table
                  role="presentation"
                  width={600}
                  cellPadding={0}
                  cellSpacing={0}
                  border={0}
                  style={{ width: 600, maxWidth: 600, backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 20 }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: '22px 32px', borderBottom: `1px solid ${C.border}` }}>
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
                        style={{
                          backgroundColor: C.cream, padding: '22px 32px', borderTop: `1px solid ${C.border}`,
                          borderRadius: '0 0 20px 20px', fontFamily: SANS, fontSize: 11.5, lineHeight: '19px', color: C.footerText,
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
function Row({ children, padding }: { children: React.ReactNode; padding: string }) {
  return (
    <tr>
      <td style={{ padding }}>{children}</td>
    </tr>
  );
}

/**
 * Durum tonu. Akış bildirimleri yeşildir; **istisna bildirimleri kendi rengini taşır** — iptal
 * kiremit, eksik karşılanma amber. Renk bir süs değil, mailin ilk yarım saniyede okunan hâlidir.
 */
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
    <Row padding="32px 32px 0">
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
    <Row padding="0 32px 18px">
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.white, border: `1px solid ${colors.border}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td width={4} style={{ width: 4, backgroundColor: colors.ink, fontSize: 0, lineHeight: 0 }}>
              &nbsp;
            </td>
            <td style={{ padding: '18px 22px' }}>
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
      <Row padding="14px 32px 0">
        <div style={{ fontFamily: SERIF, fontSize: 29, lineHeight: '36px', color: C.ink }}>{title}</div>
      </Row>
      <Row padding="10px 32px 22px">
        <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: '22px', color: C.muted }}>{intro}</div>
      </Row>
    </>
  );
}

/**
 * Künye kartı: kalın başlık + soluk ikincil satır + sağda durum hapı.
 *
 * Siparişte "LZA-2451 · 22 Temmuz · Onaylandı", talepte "Eksik ürün · 22 Temmuz'da açıldı ·
 * İnceleniyor". İki mailde aynı kutu, çünkü müşteri için ikisi de aynı soruyu cevaplıyor:
 * *hangi kayıt, ne zaman, şu an ne durumda*.
 */
export function HeaderCard({ title, meta, statusLabel }: { title: string; meta: string; statusLabel: string }) {
  return (
    <Row padding="0 32px 18px">
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.white, border: `1px solid ${C.innerBorder}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: '18px 24px' }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td valign="middle" style={{ fontFamily: SERIF, fontSize: 22, lineHeight: '28px', color: C.ink }}>
                      {title}
                      <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 'normal', color: C.faint }}>{`\u00A0\u00A0${meta}`}</span>
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
    <Row padding="0 32px 18px">
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.white, border: `1px solid ${C.innerBorder}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: '22px 24px' }}>
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
    <Row padding="0 32px 18px">
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.cream, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: '18px 22px' }}>
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
    <Row padding="0 32px 18px">
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.white, border: `1px solid ${C.innerBorder}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: '20px 24px' }}>
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
 * Yazışma balonu — personelin cevabı (14.7). Beyaz kart, üstte kim yazdı satırı, altta metnin
 * KENDİSİ.
 *
 * **Metin kırpılmaz:** personelin cevabı müşteriye aynen görünür (DOMAIN §15 — iç not yoktur).
 * Kırpsaydık müşteri cevabı okumak için tıklamak zorunda kalırdı; oysa mail zaten cevabı taşımak
 * için gidiyor. Satır sonları korunur (`whiteSpace: 'pre-line'`) — operatörün kurduğu paragraf
 * düzeni tek bir bloğa çökmesin.
 */
export function MessageCard({ title, meta, body }: { title: string; meta: string | null; body: string }) {
  return (
    <Card title={title}>
      {meta && <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: '17px', color: C.faint, paddingBottom: 8 }}>{meta}</div>}
      <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: '22px', color: C.strong, whiteSpace: 'pre-line' }}>{body}</div>
    </Card>
  );
}

/** Yeşil hap buton — her mailde tek birincil eylem. */
export function CtaButton({ label, url }: { label: string; url: string }) {
  return (
    <Row padding="2px 32px 26px">
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
 * Krem ikincil kart: serif başlık + açıklama + metin bağlantısı ("Bir sorun mu var?").
 * Beyaz kartlardan tonuyla ayrılır — bu bir bilgi değil, bir DAVETtir; birincil eylemle yarışmaz.
 * Bağlantı verilmezse yalnız bilgi kutusu olur (iade mailindeki "kapıda ödemede…" notu gibi).
 */
export function NoticeCard({ title, text, linkLabel, linkUrl }: { title: string; text: string; linkLabel?: string | null; linkUrl?: string | null }) {
  return (
    <Row padding="0 32px 18px">
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', backgroundColor: C.cream, border: `1px solid ${C.cream}`, borderRadius: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: '18px 22px' }}>
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

