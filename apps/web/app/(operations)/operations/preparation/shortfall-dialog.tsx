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
 * ── "MÜŞTERİYE SORULSUN" AÇILDI (25.08) ─────────────────────────────────────
 * Tasarım *"sipariş cevap-bekliyor durumuna geçer"* diyordu ve `OrderStatus`ta böyle bir hâl yok.
 * Eklenmedi de: bu bir DURUM değil — sipariş hâlâ hazırlanıyor, yalnız bir kalemi cevap bekliyor.
 * Soru artık **talepler kuyruğuna** düşüyor (`askCustomerAction` → siparişe ve kaleme bağlı bir
 * `question`), yani bir yere düşüyor ve unutulmuyor.
 *
 * **Düğmenin adı "sor" değil "sorulsun" ve bu kasıtlı:** soruyu depocu sormuyor — müşteriyle
 * hangi kanaldan konuşulacağına operasyon karar veriyor (kullanıcı kararı 25.08). Depocu müşteri
 * iletişimi görmez; bu pencerede de ne ad, ne adres, ne tutar var.
 */
interface ShortfallDialogProps {
  title: string;
  suggestion: ShortfallSuggestion;
  busy: boolean;
  /** Soru kuyruğa düştü mü — basıldıktan sonra düğme yerine sonucu söyleyen satır çizilir. */
  asked: boolean;
  onClose: () => void;
  onShipRest: () => void;
  onAskCustomer: () => void;
}

export function ShortfallDialog({ title, suggestion, busy, asked, onClose, onShipRest, onAskCustomer }: ShortfallDialogProps) {
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

        {/* Soru sorulduysa düğme YERİNE sonuç: aynı soruyu ikinci kez sordurmanın en kolay yolu,
            basıldıktan sonra düğmeyi olduğu gibi bırakmaktır. Kapı da ayrıca koruyor
            (`already_asked`), ama ekranın yalan söylememesi kapının işi değil. */}
        {asked ? (
          <div className="flex flex-col gap-1 rounded-ops-card border border-ops-blue-line bg-ops-blue-bg px-3.5 py-3">
            <span className="font-ops-display text-ops-sm font-semibold text-ops-blue-dark">Soru operasyona iletildi</span>
            <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
              Talepler kuyruğuna düştü; müşteriyle operasyon konuşacak. Bu kalem cevap gelene kadar bekler — siz
              öteki kalemlere devam edebilirsiniz.
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAskCustomer}
            disabled={busy}
            className="flex cursor-pointer flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3 text-left transition-colors hover:border-ops-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">
              Müşteriye sorulsun — &quot;kalanı gönderelim mi?&quot;
            </span>
            <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
              Soru talepler kuyruğuna düşer; müşteriyle operasyon konuşur. Siparişe dokunulmaz, kalem cevabı bekler.
            </span>
          </button>
        )}

        <p className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{PREP_NOTES.moneyHidden}</p>
      </div>
    </Dialog>
  );
}
