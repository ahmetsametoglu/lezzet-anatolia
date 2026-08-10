'use client';

import { resolveLocalizedText, type DiscountDraftPayload } from '@lezzet/types';
import { money, num, percent, shortDate } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import { BandBox, BandLabel, BandNote, CardLead, Facts } from './shared';

/**
 * KAMPANYA / KUPON — dilekçenin en KALABALIK tipi, kartın en zayıfıydı (kullanıcı ölçümü 11.08).
 *
 * ── NEDEN YENİDEN KURULDU ───────────────────────────────────────────────────
 * Payload on yedi alan taşıyor; kart bunlardan üçünü gösteriyordu (değer · kapsam · bitiş) ve
 * gerisini asistanın cümlesine bırakıyordu. Bir indirim kararı o üç sayıyla verilemez: **asgari
 * sepet**, **kaç kez kullanılabileceği** ve **kimin için geçerli olduğu** doğrudan cirodur.
 * Kullanıcının bu ekrandaki ilk sorusu da tam buydu (22.10): *"asgari sepete hiç girmemiş, haberi
 * var mıydı?"*
 *
 * ── HİYERARŞİ: DEĞER > KAPSAM > KOŞULLAR ────────────────────────────────────
 * ① Bantta **indirimin kendisi** (`%10` · `10,00 €`) — bir kampanyada ilk okunan sayı odur, yeşil
 *   çünkü müşterinin kazancıdır (`PriceBlock`taki "indirim" kararıyla aynı çizgi).
 * ② Kupon kodu değerin YANINDA ve çerçeveli: kod kampanyanın kapısıdır, künyeye indirilirse
 *   "kodsuz kupon" gibi okunur. Otomatik indirimde hiç çizilmez.
 * ③ Bandın altında **kapsam cümlesi** — "Tatlı kategorisinde" ile "Sepetin tamamı" arasındaki fark
 *   kampanyanın maliyetini belirler ve künye satırına sıkışacak kadar küçük bir bilgi değil.
 * ④ Künyede koşullar: asgari sepet · geçerlilik aralığı · tavanlar · müşteriye görünen ad.
 *
 * ── BOŞ KOŞUL "—" İLE DURUR ─────────────────────────────────────────────────
 * Girilmemiş bir tavan sınırsız demektir ve bunun bedeli vardır; satırı gizlemek, verilmemiş bir
 * kararı verilmiş gibi gösterir (22.10 ilkesi).
 */
export function DiscountCard({ payload }: { payload: DiscountDraftPayload }) {
  const value =
    payload.type === 'percent'
      ? payload.percent === null
        ? '—'
        : percent(payload.percent, payload.percent % 1 === 0 ? 0 : 1)
      : money(payload.amountCents);
  const publicLabel = payload.publicLabel ? resolveLocalizedText(payload.publicLabel, 'tr') : '';
  const period = [payload.validFrom, payload.validTo].some(Boolean)
    ? `${payload.validFrom ? shortDate(payload.validFrom) : 'hemen'} → ${payload.validTo ? shortDate(payload.validTo) : 'süresiz'}`
    : 'süresiz';
  const caps = [
    payload.maxUses ? `${num(payload.maxUses)} kullanım` : null,
    payload.perCustomerLimit ? `kişi başı ${num(payload.perCustomerLimit)}` : null,
    payload.firstOrderOnly ? 'yalnız ilk sipariş' : null,
  ].filter(Boolean);

  return (
    <>
      <BandBox>
        <BandLabel>{payload.trigger === 'coupon' ? 'Kupon' : 'Otomatik indirim'}</BandLabel>
        <span className="flex items-baseline gap-2">
          <span className="font-ops-mono text-ops-title font-semibold leading-none text-ops-olive-dark">{value}</span>
          {payload.code ? (
            <span className="rounded-ops-card border border-ops-line-strong px-1.5 py-0.5 font-ops-mono text-ops-sm font-semibold text-ops-ink">
              {payload.code}
            </span>
          ) : null}
        </span>
        <BandNote>{payload.name}</BandNote>
      </BandBox>

      <CardLead>
        {payload.scope === 'cart'
          ? 'Sepetin tamamında'
          : `${payload.scopeName ?? '—'} ${payload.scope === 'category' ? 'kategorisinde' : 'koleksiyonunda'}`}
      </CardLead>

      <Facts>
        <CardFact label="Asgari sepet" value={payload.minBasketCents ? money(payload.minBasketCents) : '—'} />
        <CardFact label="Geçerlilik" value={period} />
        <CardFact label="Tavan" value={caps.length > 0 ? caps.join(' · ') : 'sınırsız'} />
        {/* Müşteriye görünen ad: sepette/kasada yazacak metin. Boşsa indirim satırı ADSIZ görünür —
            bu bir eksiklik değil, onaylanmadan görülmesi gereken bir sonuç. */}
        <CardFact label="Müşteride" value={publicLabel || '—'} />
      </Facts>
    </>
  );
}
