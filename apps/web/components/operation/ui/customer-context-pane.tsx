'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { CustomerContextData } from '@/lib/customer/context';
import { AnchoredMenu } from './anchored-menu';
import { Badge } from './badge';
import { money } from './format';
import { ChevronDownIcon } from './icons';
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
 *
 * **Çizimin iskeleti (14.09 · kullanıcı isteği):** ad + rozet · son siparişler · kampanya izni · tek
 * eylem (`Operasyon - WhatsApp.dc.html`, "Müşteri bağlamı"). Açıklama paragrafı YOK: pano bir karar
 * yüzeyi, kılavuz değil — açıklaması gereken eylem kendi penceresinde anlatılır.
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

interface ContextIdentityProps {
  context: CustomerContextData;
  /** Adın bağlantısı (müşteri ekranına arama) — verilmezse düz metin. */
  href?: string;
}

/**
 * Kimlik bloğu: ad · rozet (çizim).
 *
 * Rozet TASLAĞI önceler: doğrulanmamış bir kayıt, B2B/B2C ayrımından önce bilinmesi gereken şey —
 * o kaydın siparişi de izni de henüz kimseye ait değil.
 *
 * **Anahtar satırı (telefon/e-posta) 14.09'da kalktı:** çizimde yok ve bir iş yaptırmıyordu — ad zaten
 * müşteri ekranına en ayırt edici anahtarla gidiyor (`href`).
 */
export function ContextIdentity({ context, href }: ContextIdentityProps) {
  const badge: { label: string; tone: OpsTone } = context.isDraft
    ? { label: 'Taslak kayıt', tone: 'amber' }
    : { label: context.isCompany ? 'B2B müşteri' : 'B2C müşteri', tone: 'olive' };

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
    </div>
  );
}

interface ContextOrdersProps {
  context: CustomerContextData;
  moreHref?: string;
}

/**
 * Son siparişler — numara + tutar, her biri siparişe bağlantı.
 *
 * **Sınır GÖRÜNÜR** (`ordersTruncated`): sessizce kesilen bir liste "bu müşterinin başka siparişi
 * yok" diye okunur ve tam da geçmişe bakması gereken anda operatörü yanıltır.
 */
export function ContextOrders({ context, moreHref }: ContextOrdersProps) {
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
 * Kampanya izninin ÜÇ hâli. "Sorulmadı" "reddetti" DEĞİLDİR: biri sorulmamış bir soru, öteki verilmiş
 * bir cevap. İkisini tek kovaya atmak GDPR kanıtını olmayan bir cevaba dönüştürürdü — ve "izin yok"
 * diye okunan bir kayda bir gün kampanya gönderilmemesi de bu ayrıma bağlı.
 */
export type ConsentState = 'granted' | 'refused' | 'unasked';

const CONSENT_BADGE: Record<ConsentState, { label: string; tone: OpsTone }> = {
  granted: { label: 'Açık', tone: 'olive' },
  refused: { label: 'Reddetti', tone: 'neutral' },
  unasked: { label: 'Sorulmadı', tone: 'slate' },
};

/**
 * Menünün iki kaydı — **operatör karar vermez, müşterinin dediğini yazar** (15.12): "İzin ver" yazan
 * bir seçenek izni operatörün verdiğini ima ederdi ve GDPR'da izni veren müşteridir.
 */
const CONSENT_RECORDS: ReadonlyArray<{ granted: boolean; state: ConsentState; label: string }> = [
  { granted: true, state: 'granted', label: 'Müşteri izin verdi' },
  { granted: false, state: 'refused', label: 'Müşteri reddetti' },
];

interface ContextConsentProps {
  state: ConsentState;
  /**
   * Verilirse rozet bir MENÜ açar ve müşterinin sohbette verdiği cevap kaydedilir (15.12 · 14.09).
   * Önceden panoda iki ayrı düğme ve bir açıklama paragrafıydı; çizimde yalnız rozet var.
   */
  onRecord?: (granted: boolean) => void;
  /** Menünün altındaki tek satır — kaydın nereye yazıldığı (kanala göre değişir). */
  recordHint?: string;
  busy?: boolean;
}

/** Pazarlama izni — çizimin rozeti; kayıt kapısı verilmişse rozet kendi menüsünü açar. */
export function ContextConsent({ state, onRecord, recordHint, busy = false }: ContextConsentProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const badge = <Badge tone={CONSENT_BADGE[state].tone}>{CONSENT_BADGE[state].label}</Badge>;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <SectionLabel>Kampanya izni</SectionLabel>
      {onRecord ? (
        <>
          <button
            ref={anchorRef}
            type="button"
            disabled={busy}
            onClick={() => setOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={open}
            title="Müşterinin cevabını kaydet"
            className="flex cursor-pointer items-center gap-1 text-ops-muted outline-none transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {badge}
            <ChevronDownIcon />
          </button>
          <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={220}>
            <div role="menu" className="flex flex-col py-1">
              {CONSENT_RECORDS.map((record) => (
                <button
                  key={record.label}
                  type="button"
                  role="menuitem"
                  // Seçili cevap tıklanamaz: aynı değeri ikinci kez yazmak yeni bir damga atar ve kayıt
                  // "az önce yeniden izin verdi" gibi okunurdu — izin bir kanıttır, damgası olayın anıdır.
                  disabled={record.state === state}
                  onClick={() => {
                    setOpen(false);
                    onRecord(record.granted);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 px-[13px] py-2 text-left font-ops-body text-ops-sm text-ops-strong transition-colors hover:bg-ops-subtle disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  {record.label}
                  {record.state === state ? <span className="text-ops-olive">✓</span> : null}
                </button>
              ))}
              {recordHint ? (
                <span className="border-t border-ops-line px-[13px] pt-2 pb-1 font-ops-body text-ops-xs text-ops-faint">{recordHint}</span>
              ) : null}
            </div>
          </AnchoredMenu>
        </>
      ) : (
        badge
      )}
    </div>
  );
}

interface ContextNoticeProps {
  children: ReactNode;
}

/** Panoda uyarı kutusu — taslak kimlik, eksik bilgi. Gövde ve eylem çağırandan. */
export function ContextNotice({ children }: ContextNoticeProps) {
  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3 py-2.5">{children}</div>
  );
}
