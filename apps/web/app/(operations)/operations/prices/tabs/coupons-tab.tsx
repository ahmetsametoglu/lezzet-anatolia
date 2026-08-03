'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Toggle } from '@/components/operation/form/toggle';
import { money, percent, shortDate } from '@/components/operation/ui/format';
import { setDiscountActiveAction } from '../actions';
import type { DiscountRow, PricesViewProps } from '../prices-types';

// Kupon & otomatik kampanya — TEK liste, çünkü tek varlık. Ayrımları rozetle görünür (tetik), geri
// kalan her şey ortak: kapsam, koşullar, değer, sınırlar.
//
// SATIRIN İKİ DURUMU AYRI: "aktif" operatörün niyeti, "yürürlükte" ise bugünkü gerçek. Süresi dolmuş
// ya da kullanım tavanına dayanmış bir kural AKTİF kalabilir — ekran ikisini karıştırmaz, yoksa
// "aktif" yazan ama hiç uygulanmayan kupon operatörü yanıltırdı.

export function CouponsTab({ data, onEditDiscount }: PricesViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-6 py-2.5">
        <span className="font-ops-body text-ops-xs text-ops-muted">
          Kupon kodla, kampanya kendiliğinden çalışır. Satıra tıkla → düzenle.
        </span>
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => onEditDiscount(null)}>
          + İndirim / kupon
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-6 py-4">
        {data.discounts.length === 0 ? (
          <EmptyState onCreate={() => onEditDiscount(null)} />
        ) : (
          data.discounts.map((rule) => <DiscountCard key={rule.id} rule={rule} onEdit={() => onEditDiscount(rule)} />)
        )}

        {/* Kural kartı — tasarımın uyarı bloğu. Kampanya kurarken bilinmesi gerekenler burada durur:
            kurulduktan sonra öğrenilen bir kural, yanlış kurulmuş bir kampanyadır. */}
        <div className="mt-1 flex flex-col gap-1.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-4 py-3">
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-amber">
            Kurarken bilinmesi gerekenler
          </span>
          <ul className="flex list-disc flex-col gap-1 pl-4 font-ops-body text-ops-xs leading-[1.7] text-ops-amber-dark">
            <li>
              <strong>Tek-en-büyük:</strong> indirimler üst üste binmez, müşteriye en büyüğü uygulanır — müşterinin
              genel indirim oranı da aynı havuzda yarışır.
            </li>
            <li>Paketlere ve yaklaşan tarihli teklife hiçbir genel indirim binmez; onlar kendi özel fiyatındadır.</li>
            <li>Kupon daima sepet kapsamlıdır; kategori/koleksiyon kapsamı yalnız otomatik kampanyada anlamlıdır.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-10">
      <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Tanımlı indirim yok</span>
      <span className="max-w-[440px] text-center font-ops-body text-ops-sm leading-relaxed text-ops-muted">
        Kupon müşterinin kod yazarak kullandığı indirimdir; otomatik kampanya koşulları tutunca kendiliğinden
        uygulanır. İkisi de aynı formdan açılır.
      </span>
      <Button variant="primary" onClick={onCreate}>
        + İndirim / kupon
      </Button>
    </div>
  );
}

interface DiscountCardProps {
  rule: DiscountRow;
  onEdit: () => void;
}

function DiscountCard({ rule, onEdit }: DiscountCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hata YUTULMAZ: yazım düşerse `router.refresh()` eski değeri geri getirir ve anahtar kendiliğinden
  // geri döner — sebebi yazılmazsa operatör "tıkladım olmadı" diye ikinci kez basar.
  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    const { error: actionError } = await setDiscountActiveAction(rule.id, next);
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-3.5 rounded-ops-card border bg-ops-white px-4 py-3 ${
        rule.liveNow ? 'border-ops-line' : 'border-ops-line-soft'
      }`}
    >
      <Badge tone={rule.trigger === 'coupon' ? 'blue' : 'amber'}>{rule.trigger === 'coupon' ? 'Kupon' : 'Kampanya'}</Badge>

      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-px text-left"
      >
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{rule.name}</span>
          {/* KODLARIN HEPSİ görünür — bir kuponun birden çok kapısı var ve hangi dilde hangisinin
              tuttuğu operasyonel bir bilgi. Yalnız "ilk kod" gösterilseydi Fransızca kodu olan bir
              kuponu operatör listede arayıp bulamazdı. Sayı yalnız KULLANILMIŞ kapıda yazılır:
              sıfır, üç kodun yanına üç kez basıldığında satırı okunmaz yapardı. */}
          {rule.codes.map((code) => (
            <span key={code.id} className="font-ops-mono text-ops-xs text-ops-olive-dark">
              {code.code}
              {code.usedCount > 0 ? <span className="text-ops-faint"> ·{code.usedCount}</span> : null}
            </span>
          ))}
        </span>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">{conditionLine(rule)}</span>
      </button>

      <span className="font-ops-mono text-ops-base font-medium text-ops-ink">
        {rule.percent != null ? percent(rule.percent) : rule.amountCents != null ? money(rule.amountCents) : '—'}
      </span>

      {/* Kullanım sayısı KAYITTAN gelir. Tavan varsa "3/100", yoksa yalnız kullanım adedi — sıfır da
          bilgidir ("hiç kullanılmamış"). */}
      <span className="font-ops-mono text-ops-xs text-ops-muted" title="Bugüne kadar kaç siparişte kullanıldı">
        {rule.maxUses === null ? `${rule.usedCount} kullanım` : `${rule.usedCount}/${rule.maxUses}`}
      </span>

      {/* İki ayrı bilgi, iki ayrı gösterge: anahtar NİYETİ (aktif mi), rozet GERÇEĞİ (bugün
          uygulanıyor mu) söyler. Aynı yere sıkıştırmak ikisini karıştırırdı. */}
      {rule.liveNow ? (
        <Badge tone="olive" dot>
          Yürürlükte
        </Badge>
      ) : (
        <Badge tone="neutral">{rule.dormantReason}</Badge>
      )}

      <span className={busy ? 'opacity-50' : undefined}>
        <Toggle on={rule.isActive} onChange={busy ? undefined : (next) => void toggle(next)} label="Aktif" size="sm" />
      </span>

      {error ? (
        <span className="w-full font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span>
      ) : null}
    </div>
  );
}

/** Koşulları TEK cümlede toplar — kartın ikinci satırı: "Sepet · asgari 50 € · müşteri başı 1". */
function conditionLine(rule: DiscountRow): string {
  const parts: string[] = [
    rule.scope === 'cart' ? 'Sepet' : rule.scope === 'category' ? `Kategori: ${rule.scopeName}` : `Koleksiyon: ${rule.scopeName}`,
  ];
  if (rule.minBasketCents !== null) parts.push(`asgari ${money(rule.minBasketCents)}`);
  if (rule.firstOrderOnly) parts.push('yalnız ilk sipariş');
  if (rule.customerName) parts.push(`kişisel: ${rule.customerName}`);
  if (rule.perCustomerLimit !== null) parts.push(`müşteri başı ${rule.perCustomerLimit}`);
  if (rule.validFrom || rule.validTo) {
    parts.push(`${rule.validFrom ? shortDate(rule.validFrom) : '…'} – ${rule.validTo ? shortDate(rule.validTo) : '…'}`);
  }
  return parts.join(' · ');
}
