import type { ReactNode } from 'react';
import Link from 'next/link';
import type { CustomerContextData } from '@/lib/customer/context';
import { Badge } from './badge';
import { money } from './format';
import { SectionLabel } from './message-thread';
import type { OpsTone } from './tone';

/**
 * **MÜŞTERİ BAĞLAMI panosu** — kuyruk–detay ekranlarının sağ sütunu (WhatsApp 15.5 · Talepler 16.3).
 *
 * Pano bir MÜŞTERİ görünümüdür, bir WhatsApp ya da talep görünümü değil: "kim bu, ne aldı, neye izin
 * verdi" sorusu iki ekranda da aynı soru ve aynı cevabı hak ediyor. WhatsApp'ta yazılmıştı,
 * Talepler'de hiç yoktu — talep detayı müşterinin başka siparişlerini göstermiyordu ve iade kararı
 * tam da o bağlamla veriliyor.
 *
 * **Ekrana özel bloklar `children` olarak geçer** (bağlı talepler, bağlı konuşma, eylem düğmesi):
 * ortaklaşan şey kimlik + siparişler + izin; ötesi her ekranın kendi işi. Hepsini prop'a çevirmek,
 * panoyu iki ekranın birleşik ihtiyaç listesine dönüştürürdü.
 */

interface ContextPaneProps {
  /** Panonun genişliği (px) — sağ sütun ekranın kalanına göre ayarlanır. */
  width?: number;
  children: ReactNode;
}

export function ContextPane({ width = 232, children }: ContextPaneProps) {
  return (
    <div
      style={{ width }}
      className="flex flex-none flex-col gap-3.5 overflow-y-auto border-l border-ops-line bg-ops-gray-25 px-4 py-3.5"
    >
      {children}
    </div>
  );
}

/**
 * Kimlik bloğu: ad · rozet · ikinci anahtar (telefon ya da e-posta).
 *
 * Rozet TASLAĞI önceler: doğrulanmamış bir kayıt, B2B/B2C ayrımından önce bilinmesi gereken şey —
 * o kaydın siparişi de izni de henüz kimseye ait değil.
 */
export function ContextIdentity({
  context,
  href,
  secondary,
}: {
  context: CustomerContextData;
  /** Adın bağlantısı (müşteri ekranına arama) — verilmezse düz metin. */
  href?: string;
  /** Ad altında gösterilecek anahtar; verilmezse telefon, o da yoksa e-posta. */
  secondary?: string | null;
}) {
  const badge: { label: string; tone: OpsTone } = context.isDraft
    ? { label: 'Taslak kayıt', tone: 'amber' }
    : { label: context.isCompany ? 'B2B müşteri' : 'B2C müşteri', tone: 'olive' };
  const key = secondary ?? context.phone ?? context.email;

  return (
    <div className="flex flex-col items-start gap-1.5">
      {href ? (
        <Link href={href} className="cursor-pointer font-ops-display text-ops-base font-semibold text-ops-ink hover:text-ops-olive">
          {context.name}
        </Link>
      ) : (
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{context.name}</span>
      )}
      <Badge tone={badge.tone}>{badge.label}</Badge>
      {key ? <span className="truncate font-ops-mono text-ops-xs text-ops-muted">{key}</span> : null}
    </div>
  );
}

/**
 * Son siparişler — numara + tutar, her biri siparişe bağlantı.
 *
 * **Sınır GÖRÜNÜR** (`ordersTruncated`): sessizce kesilen bir liste "bu müşterinin başka siparişi
 * yok" diye okunur ve tam da geçmişe bakması gereken anda operatörü yanıltır.
 */
export function ContextOrders({ context, moreHref }: { context: CustomerContextData; moreHref?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Son siparişler</SectionLabel>
      {context.orders.length === 0 ? (
        <span className="font-ops-body text-ops-xs text-ops-faint">Henüz sipariş yok.</span>
      ) : (
        context.orders.map((o) => (
          <Link
            key={o.id}
            href={o.href}
            className="flex cursor-pointer items-center justify-between rounded-ops-card border border-ops-line bg-ops-card px-2.5 py-2 hover:border-ops-line-strong"
          >
            <span className="font-ops-mono text-ops-xs text-ops-muted">{o.label}</span>
            <span className="font-ops-mono text-ops-xs text-ops-ink">{money(o.totalCents)}</span>
          </Link>
        ))
      )}
      {context.ordersTruncated ? (
        moreHref ? (
          <Link href={moreHref} className="cursor-pointer font-ops-body text-ops-micro text-ops-olive hover:underline">
            Daha eski siparişler →
          </Link>
        ) : (
          <span className="font-ops-body text-ops-micro text-ops-faint">Daha eskisi müşteri kartında.</span>
        )
      ) : null}
    </div>
  );
}

/**
 * Pazarlama izni — SALT OKUNUR ve ÜÇ HÂLLİ.
 *
 * `null` "reddetti" DEĞİLDİR: biri sorulmamış bir sorudur, öteki verilmiş bir cevap. İkisini tek
 * kovaya atmak, GDPR kanıtını olmayan bir cevaba dönüştürürdü — ve "izin yok" diye okunan bir
 * kayda bir gün kampanya gönderilmemesi de bu ayrıma bağlı.
 */
export function ContextConsent({ context, channel }: { context: CustomerContextData; channel: 'whatsapp' | 'email' }) {
  const consent = channel === 'whatsapp' ? context.whatsappConsent : context.emailConsent;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <SectionLabel>Kampanya izni</SectionLabel>
      <Badge tone={consent?.granted ? 'olive' : consent ? 'neutral' : 'slate'}>
        {consent?.granted ? 'Açık' : consent ? 'Reddetti' : 'Sorulmadı'}
      </Badge>
    </div>
  );
}

/** Panoda uyarı kutusu — taslak kimlik, eksik bilgi. Gövde ve eylem çağırandan. */
export function ContextNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3 py-2.5">{children}</div>
  );
}
