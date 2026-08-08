'use client';

import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { num } from '@/components/operation/ui/format';
import { PREP_NOTES, shortfallAdvice } from './preparation-labels';
import type { ShortfallSuggestion } from '@lezzet/domain-core';

/**
 * **Eksik kararı** (10.3) — `design/project/Operasyon - Depo Hazirlik.dc.html`, kare 2 alt bölüm.
 *
 * ── TAVSİYE MOTORDAN, KARAR İNSANDAN ────────────────────────────────────────
 * Motor eşiklere bakıp bir yol öneriyor (`suggestShortfallAction`), ama seçmiyor. Tasarımın kendi
 * cümlesi: *"Karar sizin."* Öneri gizlenseydi depocu her eksikte aynı soruyu sıfırdan düşünürdü;
 * öneri uygulanmış olsaydı, sistemin yerine karar verdiği ilk yer burası olurdu.
 *
 * ── PARA GÖRÜNMEZ ───────────────────────────────────────────────────────────
 * Motorun parasal ölçütü var ama dönen tavsiyede tutar YOK (testli). Bu pencere de tutar yazmıyor;
 * "fark iadesi" bile rakamsız anlatılıyor — tasarımın rol duvarı.
 *
 * ── "MÜŞTERİYE SOR" BUGÜN ÇİZİLMİYOR ────────────────────────────────────────
 * Tasarım *"Sipariş cevap-bekliyor durumuna geçer"* diyor; `OrderStatus` böyle bir hâl TAŞIMIYOR
 * (`draft·confirmed·preparing·ready·out_for_delivery·delivered·completed·cancelled·returned`) ve
 * o geçişi yazacak kapı da yok. Düğmeyi çalışıyormuş gibi koymak, basan operatöre müşterinin
 * sorulduğunu sandırırdı — oysa hiçbir yere düşmezdi. Kapalı ve sebebi yazılı.
 * BEKLEYEN(10.3)
 */
interface ShortfallDialogProps {
  title: string;
  suggestion: ShortfallSuggestion;
  busy: boolean;
  onClose: () => void;
  onShipRest: () => void;
}

export function ShortfallDialog({ title, suggestion, busy, onClose, onShipRest }: ShortfallDialogProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title={`Eksik kararı — ${title}`}
      subtitle={`${num(suggestion.missingQty)} paket eksik kaldı`}
      footer={
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Kapat
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3 py-2.5 font-ops-body text-ops-xs leading-[1.55] text-ops-body">
          {shortfallAdvice(suggestion)}
        </p>

        <button
          type="button"
          onClick={onShipRest}
          disabled={busy}
          className="flex cursor-pointer flex-col gap-1 rounded-ops-card border border-ops-olive-line bg-ops-olive-bg px-3.5 py-3 text-left transition-colors hover:border-ops-olive disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="font-ops-display text-ops-sm font-semibold text-ops-olive-dark">Kalanı gönder</span>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
            Eksik, teslimat özetinde açıkça yazılır. Sipariş toplanan adetle sürer.
          </span>
        </button>

        {/* Kapalı ama SEBEBİ yazılı: basılınca hiçbir şey olmayan bir düğmeden iyidir. */}
        <div className="flex flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3 opacity-70">
          <span className="font-ops-display text-ops-sm font-semibold text-ops-muted">
            Müşteriye sor — &quot;kalanı göndereyim mi?&quot;
          </span>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
            Bu yol henüz açık değil: siparişin &quot;cevap bekliyor&quot; diye bir hâli yok, o yüzden soru hiçbir yere
            düşmezdi. Müşteriyle konuşulacaksa şimdilik operasyona haber verin.
          </span>
        </div>

        <p className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{PREP_NOTES.moneyHidden}</p>
      </div>
    </Dialog>
  );
}
