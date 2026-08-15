'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { num } from '@/components/operation/ui/format';
import type { PendingPurchase, StockViewProps } from '../stock-types';

/**
 * **MAL KABUL SEKMESİ — depoya giren** (22.26). Eskiden `/operations/receiving` ayrı bir sayfaydı.
 *
 * ── SEKME LİSTE, KARAR DİYALOGDA ────────────────────────────────────────────
 * Sekme "ne bekliyorum"u gösterir; sayım ve kayıt liste ÜSTÜNDE açılan formda yapılır — bu ekranın
 * kendi deseni (teklif diyaloğu, lot sorgusu) ve tasarımın kuralı: *"kararlar liste üstünde açılan
 * formlarda verilir"*. Eski sayfa formu sağ sütunda kalıcı tutuyordu ve liste ile form sürekli
 * birbirinin yerini daraltıyordu.
 *
 * ── LİSTE DEPO-ÜSTÜ, KABUL DEĞİL ────────────────────────────────────────────
 * Tedarik siparişi bir depoya ait değildir; mal kabul edilirken bir kapıdan girer. Bu yüzden liste
 * bağlamla daralmaz ama kabul diyaloğu depoyu SORAR ve varsayılan üretmez (`CLAUDE §1`).
 *
 * ── BEKLEYEN "KABUL EDİLENLER" LİSTESİ ──────────────────────────────────────
 * Tasarım bu sekmede iki bölüm istiyor: bekleyenler + geçmiş girişler. İkincisi henüz yok —
 * `stock_intake` için sayfalı bir okuma yazılmadı (bugün yalnız tedarikçi bazlı okuma var). Boş bir
 * bölüm çizmiyoruz: `BEKLEYEN(22.28)`.
 */
export function IntakeTab({ data, onOpenIntake }: StockViewProps) {
  const intake = data.intake;
  // Sekme verisi yalnız sekme açıkken okunuyor; `null` sunucu turu daha bitmediyse olur.
  if (!intake) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-ops-line px-6 py-2.5">
        <span className="font-ops-body text-ops-sm text-ops-muted">
          Sipariş seçip sayıma başlayın; irsaliyesiz gelen mal için boş form açın.
        </span>
        <Button variant="secondary" size="sm" onClick={() => onOpenIntake(null)}>
          + Boş formla kabul
        </Button>
      </div>

      {intake.pending.length === 0 ? (
        <EmptyState
          title="Kabul bekleyen sipariş yok"
          description="Açık tedarik siparişlerinin tamamı karşılandı. İrsaliyesiz gelen mal için “Boş formla kabul” ile giriş yapabilirsiniz."
        />
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {intake.pending.map((purchase) => (
            <li key={purchase.purchaseOrderId}>
              <PendingRow purchase={purchase} onOpen={() => onOpenIntake(purchase.purchaseOrderId)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Bekleyen sipariş kartı — numara, tedarikçi, kaç kalem, kaç gündür bekliyor.
 *
 * **Yaş bir UYARIDIR, hata değil:** 14 gündür bekleyen sipariş kaybolmuş olabilir de, tedarikçinin
 * teslim takvimi öyle de olabilir. Ekran işaretler, karar operatörün (`DOMAIN §4`).
 */
function PendingRow({ purchase, onOpen }: { purchase: PendingPurchase; onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ops-line-soft px-6 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">
            {purchase.referenceNo ?? 'Numarasız sipariş'}
          </span>
          {purchase.isPartial ? <Badge tone="amber">kısmen geldi</Badge> : null}
          {/* Yaş eşiği: bir haftayı geçen bekleyiş görünür olmalı. Değer parametrik değil çünkü bir
              ayar değil, okumanın kendisi — operatör sayıyı görüp kendi kararını veriyor. */}
          {purchase.ageDays !== null && purchase.ageDays >= 7 ? (
            <Badge tone="red">{num(purchase.ageDays)} gündür bekliyor</Badge>
          ) : null}
        </div>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">
          {purchase.supplierName} · {num(purchase.missingLineCount)} kalem bekliyor
          {purchase.ageDays === null ? ' · henüz gönderilmedi' : ''}
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={onOpen}>
        Kabul et
      </Button>
    </div>
  );
}
