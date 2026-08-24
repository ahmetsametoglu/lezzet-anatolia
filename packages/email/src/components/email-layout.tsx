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

/*
  METNİN HİZASI — TEK SAYI, YEDİ BLOK (MB-40, ölçüldü 24.08).

  ── ARIZA NEYDİ ─────────────────────────────────────────────────────────────
  Arka-uç şeridi talep mailinde *"üç kartın üç farklı genişliği"* diye bir bulgu bırakmış ve
  ölçümünü bize devretmişti. Ölçünce izlenim doğru, ADI yanlış çıktı: **kartların kutuları AYNI
  genişlikte** (600 − 2×32 = 536 px). Farklı olan, metnin nerede BAŞLADIĞI — ve sayfa kenarından
  ölçüldüğünde bugün beş ayrı değer vardı:

      QuoteCard 46 · InfoBlock 54 · NoticeCard 55 · HeaderCard/Timeline/Card 57 · StatusBlock 59

  Yani maili aşağı okurken metnin sol kenarı zıplıyordu. Hiçbiri hata vermez, hiçbiri testte
  görünmez; yalnız mail derli toplu durmaz.

  ── NEDEN TEK SABİT, BLOK BLOK DÜZELTME DEĞİL ───────────────────────────────
  Değerler elle yazılmıştı ve her blok kendi iç boşluğunu kendi biliyordu; sekizinci blok yazılan
  gün altıncı bir değer doğardı. Hiza artık TÜRETİLİYOR: ortak hedef tek yerde durur, her blok
  kendi kenarlığını/şeridini ondan düşer. Yeni blok yazan kişi bir sayı seçmez, `innerX`i çağırır.

  ── SÜRÜKLENME TALEP MAİLİNE ÖZEL DEĞİLDİ ───────────────────────────────────
  Bulgu talep mailinden geldi ama beş değerin dördü sipariş/geri bildirim maillerinde de duruyor;
  yalnız talep mailinin üç bloğunu hizalamak, aynı arızayı öteki maillerde bırakmak olurdu.
*/

/** Gövde satırının yatay dolgusu — `Row`ın tek yatay ölçüsü. */
const ROW_INSET = 32;

/**
 * Metnin SAYFA KENARINDAN uzaklığı — bütün blokların ortak hizası.
 *
 * 57 seçildi çünkü bugün ÇOĞUNLUK oydu (`HeaderCard` · `Timeline` · `Card`): en az bloğu oynatan
 * değer, yani en az görsel risk taşıyan. Keyfî bir sayı değil, mevcut tasarımın kendi kararı.
 */
const TEXT_INSET = 57;

/**
 * Bir bloğun iç YATAY boşluğu: ortak hizadan satır dolgusu, bloğun kendi kenarlığı ve (varsa) sol
 * vurgu şeridi düşülür. Kenarlığı olmayan blok (`InfoBlock`) 0 geçer — 1 px'lik fark bile metni
 * komşusundan kaydırıyordu ve tam olarak bu yüzden elle hesaplanmamalı.
 */
const innerX = (border: number, stripe = 0): number => TEXT_INSET - ROW_INSET - border - stripe;

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
function Row({ children, top, bottom }: { children: React.ReactNode; top: number; bottom: number }) {
  /* YATAY dolgu prop DEĞİL: on iki çağıranın on ikisi de aynı 32'yi yazıyordu ve `ROW_INSET`
     yalnız `innerX`in içinde yaşadığı sürece SABİT YALAN SÖYLERDİ — biri onu değiştirse satırlar
     yerinde kalır, hiza sessizce bozulurdu. Dikey dolgu bloktan bloğa gerçekten değişiyor
     (ritim), o yüzden o prop kaldı. */
  return (
    <tr>
      <td style={{ padding: `${top}px ${ROW_INSET}px ${bottom}px` }}>{children}</td>
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
            {/* Sol vurgu şeridi de hizaya dahil: 4 px'i `innerX`e bildiriliyor, yoksa bu bloğun
                metni komşularından tam o kadar sağda başlardı (ölçüldü: 59 ↔ 57). */}
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

/**
 * **Künye SATIRI** — kartın kutusuz kardeşi (09.08, kullanıcı gözlemi telefondan).
 *
 * Neden var: künye bir HABER değil, bir etikettir ("hangi kayıt, ne zaman"). Kart olarak çizilince
 * mailin en üstünde, asıl haberin ÖNÜNDE tam yükseklikte bir blok kaplıyordu ve dar bir telefon
 * ekranında müşteri cevabı görmek için kaydırmak zorunda kalıyordu (ölçüldü: iki satırlık içerik,
 * altı dikey blok). Kutusu alınınca blok sayısı düşer, sıralama serbest kalır.
 *
 * **Durum hapı YOK** ve bu bilinçli: durumu üstteki `StatusPill` zaten söylüyor. Kartlı sürümde iki
 * kez yazılıyordu (`✉ Ouverte` … `Autre · Ouverte le 9 août · Ouverte`) — aynı bilgiyi iki kez
 * okutmak, okuyanın ikisinin farklı şeyler olduğunu sanmasına yol açar.
 *
 * Kartlı `HeaderCard` DURUYOR: sipariş mailleri onu kullanıyor ve orada künye gerçekten haberin
 * kendisidir (referans no + tutar + durum bir arada okunur).
 */
export function MetaLine({ text }: { text: string }) {
  return (
    <Row top={0} bottom={20}>
      <div style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: '18px', color: C.faint }}>{text}</div>
    </Row>
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
 * Yazışma balonu — personelin cevabı (14.7). Beyaz kart, üstte kim yazdı satırı, altta metnin
 * KENDİSİ.
 *
 * **Metin kırpılmaz:** personelin cevabı müşteriye aynen görünür (DOMAIN §15 — iç not yoktur).
 * Kırpsaydık müşteri cevabı okumak için tıklamak zorunda kalırdı; oysa mail zaten cevabı taşımak
 * için gidiyor. Satır sonları korunur (`whiteSpace: 'pre-line'`) — operatörün kurduğu paragraf
 * düzeni tek bir bloğa çökmesin.
 */
// `title` NULL OLABİLİR (17.08): art arda gelen kartlarda başlığı tekrarlamak ("Cevabımız ·
// Cevabımız · Cevabımız") bilgi değil gürültüdür — ilki söyler, ötekiler sürdürür.
export function MessageCard({ title, meta, body }: { title: string | null; meta: string | null; body: string }) {
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
  body: string;
  /** Gövde kırpıldıysa altına düşen dürüstlük satırı; kırpılmadıysa null. */
  note?: string | null;
}

/**
 * Alıntılanan yazışma (16.4) — mailin KONUSU olan mesajın altında duran bağlam.
 *
 * Ayrı bir çizimi yok; `MessageCard`ın soluklaştırılmış hâlidir ve alıntı olduğunu üç işaretle
 * söyler: sol çizgi, küçük punto, soluk renk. Yeni mesajla aynı ağırlıkta çizilseydi müşteri
 * hangisinin bugünkü haber olduğunu ayırt edemezdi — mailin tek işi o farkı göstermek.
 *
 * Sıra **en yeniden eskiye**: e-posta alıntı geleneği bu, ve müşterinin aradığı şey en son ne
 * konuşulduğu.
 *
 * ── KUTUSU KALKTI (09.08 · referans proje `support-reply.tsx`) ───────────────
 * Beyaz kart içindeydi ve dar ekranda mailin üçüncü tam yükseklikli bloğuydu. Ama alıntı bir KART
 * değil bir DİPNOTTUR: sol çizgi + soluk renk zaten "bu eski" diyor, kutu bunun üstüne bir de
 * "bu ayrı bir bölüm" diyordu. Referans projede aynı blok kutusuz — yalnız `borderLeft` ve soluk
 * metin. Kutunun kalkması kartlı blok sayısını üçten BİRE indirdi (yalnız haberin kendisi kart).
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
              {/* Alıntı bir KART DEĞİL, şeritle işaretli bir liste — kutusu yok, o yüzden hizayı
                  kendi şeridinden (2 px) türetiyor. Bugüne dek metni 46 px'te başlıyordu, yani
                  kartların 11 px SOLUNDA: alıntı normalde daha içeride durur, burada dışarıda
                  duruyordu ve göz sütunu kaybediyordu. */}
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
 * Krem ikincil kart: serif başlık + açıklama + metin bağlantısı ("Bir sorun mu var?").
 * Beyaz kartlardan tonuyla ayrılır — bu bir bilgi değil, bir DAVETtir; birincil eylemle yarışmaz.
 * Bağlantı verilmezse yalnız bilgi kutusu olur (iade mailindeki "kapıda ödemede…" notu gibi).
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

