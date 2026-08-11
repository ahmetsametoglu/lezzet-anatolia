'use client';

import type { DiscountDraftPayload } from '@lezzet/types';
import {
  DiscountFormBody,
  type DiscountField,
  type DiscountFormValues,
} from '@/components/operation/form/discount-form';
import { ProposalAside, type ProposalFact } from '@/components/operation/ui/proposal-aside';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';
import { money, percent, shortDate } from '@/components/operation/ui/format';

/**
 * KAMPANYA / KUPON ÖNERİSİ — kuyruğun içinde, GERÇEK formuyla (22.10).
 *
 * ── NEDEN BU TİP, VE NEDEN FORMUN KENDİSİ ───────────────────────────────────
 * Kullanıcının cümlesi: *"Uygula dediğim zaman bana 'tarihi ve oranı indirim ekranında düzenlenir'
 * diye bir şey geliyor. Doğrudan bu indirimle alakalı formun önüme gelmesini istiyorum."* (10.08)
 * Tip bir tur `draft_then_edit`ti — pasif bir kural yaratıp operatörü fiyat ekranına yolluyordu.
 * Artık kural KUYRUKTA kuruluyor ve kaydeden kapı yine fiyat ekranının kendi eylemi.
 *
 * ── YENİ FORM YAZILMADI ─────────────────────────────────────────────────────
 * Soldaki gövde `DiscountFormBody`: `discount-dialog`un da kullandığı form. Kopyalansaydı bir gün
 * biri "yüzde 100 tavanı"nı ya da "kodsuz kupon" engelini unuturdu ve aynı kural iki ekranda iki
 * farklı emniyetle kaydedilirdi. Engel ve dönüşüm de o dosyada — kabuk yalnız çiziyor.
 *
 * ── SAĞDAKİ SÜTUN FORMUN TEKRARI DEĞİL, DİLEKÇENİN KAYDI ────────────────────
 * Form bir taslaktır ve operatör ona dokundukça asistanın ne dediği kaybolur. `ProposalAside` o
 * kaydı tutuyor ve sapmayı satırın üstünde gösteriyor (`proposal-aside` künyesi). Bir tur bu sütun
 * başlıksızdı ve formu birebir tekrar ediyordu; başlık gelince aynı sayılar iki farklı soruya cevap
 * verir oldu — "ne yazıyorum" ve "asistan ne demişti".
 */

interface DiscountDraftBodyProps {
  payload: DiscountDraftPayload;
  /** Önerinin konusu — kapsam kategorisi/koleksiyonu; sepet kapsamında `null`. */
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  values: DiscountFormValues;
  filled: ReadonlySet<DiscountField>;
  onChange: (next: DiscountFormValues) => void;
  disabled: boolean;
  /** Karar VERİLMİŞ öneri — aynı form, düzenlenmeyen hâliyle. */
  readOnly: boolean;
}

export function DiscountDraftBody({
  payload,
  subject,
  options,
  values,
  filled,
  onChange,
  disabled,
  readOnly,
}: DiscountDraftBodyProps) {
  return (
    <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-white p-3.5">
      {/* İKİ SÜTUN, üç değil (fırsat kartından ayrılan yer). Fırsatta karar dört sayının
          karşılaştırmasıydı ve künye kadar yer tutuyordu; burada karar FORMUN kendisi — on beş
          kutu. Formu üçte bire sıkıştırmak, taşıdığımız formu tanınmaz hâle getirirdi. */}
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-[22rem] flex-[2] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
          <DiscountFormBody
            values={values}
            onChange={onChange}
            categories={options.categories}
            collections={options.collections}
            filled={readOnly ? undefined : filled}
            disabled={disabled || readOnly}
          />
        </div>

        <ProposalAside
          subject={subject}
          // Sepet kapsamının bir KAYDI yok; kart uydurmak yerine tek satırla söyleniyor.
          fallbackTitle="Sepetin tamamı"
          // Künye satırları SAPMA gösterenler (operatör formu değiştirdikçe asistanınki üstü çizili
          // kalır); dilekçenin tamamı altta okunur ağaç olarak (22.15).
          facts={proposalFacts(payload, values)}
          payload={payload}
        />
      </div>
    </div>
  );
}

/**
 * Dilekçenin okunur hâli — ve her satırın karşısında operatörün şu anki değeri.
 *
 * **Boş bırakılan alanlar da listede** ("—"): kullanıcının ilk sorusu tam buydu (*"asgari sepete
 * hiç girmemiş, acaba haberi var mıydı?"*). Boş bir satırı listeden çıkarmak, o kararın hiç
 * verilmediğini gizlerdi; tire ile durması "asistan buna baktı ve boş bıraktı" der.
 */
function proposalFacts(payload: DiscountDraftPayload, values: DiscountFormValues): ProposalFact[] {
  const offered = payload.type === 'percent' ? payload.percent : payload.amountCents;
  const valueText = (raw: number | null, type: DiscountDraftPayload['type'], inCents: boolean) =>
    raw === null ? '—' : type === 'percent' ? percent(raw, raw % 1 === 0 ? 0 : 1) : money(inCents ? raw : raw * 100);

  return [
    {
      label: 'Tetik',
      value: payload.trigger === 'coupon' ? 'Kupon' : 'Otomatik',
      now: values.trigger === 'coupon' ? 'Kupon' : 'Otomatik',
    },
    {
      label: payload.type === 'percent' ? 'Oran' : 'Tutar',
      value: valueText(offered, payload.type, true),
      now: valueText(values.value, values.type, false),
    },
    {
      label: 'Kapsam',
      value: payload.scope === 'cart' ? 'Sepet (tümü)' : (payload.scopeName ?? '—'),
    },
    ...(payload.code ? [{ label: 'Kod', value: payload.code, now: values.codes.tr || '—' }] : []),
    {
      label: 'Müşteri metni',
      value: languageTally(payload.publicLabel),
      now: languageTally(values.publicLabel),
    },
    {
      label: 'Asgari sepet',
      value: payload.minBasketCents === null ? '—' : money(payload.minBasketCents),
      now: values.minBasket === null ? '—' : money(values.minBasket * 100),
    },
    {
      label: 'Yalnız ilk sipariş',
      value: payload.firstOrderOnly ? 'evet' : 'hayır',
      now: values.firstOrderOnly ? 'evet' : 'hayır',
    },
    {
      label: 'Kullanım tavanı',
      value: limitText(payload.maxUses ?? null, payload.perCustomerLimit ?? null),
      now: limitText(intOrNull(values.maxUses), intOrNull(values.perCustomerLimit)),
    },
    {
      label: 'Geçerlilik',
      value: rangeText(payload.validFrom, payload.validTo),
      now: rangeText(values.validFrom || null, values.validTo || null),
    },
  ];
}

/**
 * Müşteri metninin DİL SAYIMI — metnin kendisi değil.
 *
 * Sepette görünecek etiket üç dilde ayrı ayrı yazılıyor ve künyede tam metni göstermek satırı
 * taşırırdı. Kararın sorusu zaten "hangi diller dolu": eksik dil, o dildeki müşterinin yalnız
 * "İndirim" görmesi demek.
 */
function languageTally(label: Record<string, string | undefined> | null | undefined): string {
  const langs = Object.entries(label ?? {})
    .filter(([, text]) => (text ?? '').trim())
    .map(([lang]) => lang.toUpperCase());
  return langs.length > 0 ? langs.join(' · ') : '—';
}

/** İki tavan tek satırda: "100 · kişi başı 1". İkisi de boşsa sınırsız. */
function limitText(total: number | null, perCustomer: number | null): string {
  if (total === null && perCustomer === null) return 'sınırsız';
  const parts = [total === null ? null : `${total}`, perCustomer === null ? null : `kişi başı ${perCustomer}`];
  return parts.filter(Boolean).join(' · ');
}

/** Tarih aralığı; iki uç da boşsa süresiz. */
function rangeText(from: string | null, to: string | null): string {
  if (!from && !to) return 'süresiz';
  return `${from ? shortDate(from) : '—'} → ${to ? shortDate(to) : 'süresiz'}`;
}

/** Formun metin kutusundaki sayı; boş ya da anlamsızsa `null` ("sınır yok"). */
function intOrNull(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() && Number.isInteger(n) && n > 0 ? n : null;
}
