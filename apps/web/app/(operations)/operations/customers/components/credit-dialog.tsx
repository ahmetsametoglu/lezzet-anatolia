'use client';

import { useState } from 'react';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MoneyField } from '@/components/operation/form/money-input';
import { ToggleField } from '@/components/operation/form/toggle';
import { money } from '@/components/operation/ui/format';
import { InlineMetric } from '@/components/operation/ui/inline-metric';
import { fromCents, toCents } from '@lezzet/helper';
import type { CreditFormInput, CustomerDetail } from '../customers-types';

/**
 * Vade / limit diyaloğu — tasarımdaki "Café Marceau · karne karar desteğidir".
 *
 * ÜÇ ALAN TEK FORMDA çünkü tek karardır: vade açmak "ne kadara kadar, kaç güne" sorusunu da
 * yanıtlamak demektir. Ayrı ayrı kaydedilseydi yetkisi açık ama limiti/süresi boş bir ara hâl doğardı
 * ve checkout o hâlde ne yapacağını bilemezdi.
 *
 * **Karne KARAR DESTEĞİDİR, otomasyon değil** (tasarım §6): diyalog "önerilen limit" hesaplamaz.
 * Üstte karnenin üç sayısı TEK kutuda durur (ort. ödeme · gecikme · açık bakiye) ve kutunun rengi
 * durumu söyler; sayıyı okuyup kararı admin verir.
 *
 * Vade kapatılınca limit/süre alanları kilitlenir — kapalı bir yetkinin altındaki sayı, bir gün yetki
 * açıldığında kimsenin hatırlamadığı bir limit olurdu (action da onları temizliyor).
 */
const FORM_ID = 'credit-form';

interface CreditDialogProps {
  customerName: string;
  detail: CustomerDetail;
  saving: boolean;
  error: string | null;
  onSave: (input: CreditFormInput) => void;
  onClose: () => void;
}

export function CreditDialog({ customerName, detail, saving, error, onSave, onClose }: CreditDialogProps) {
  const [enabled, setEnabled] = useState(detail.creditEnabled);
  // Limit EURO tutulur (`MoneyField`'ın tabanı); kuruşa çevrim kaydetmede, tek yerde (STACK §8).
  const [limitEuro, setLimitEuro] = useState<number | null>(
    detail.creditLimitCents === null ? null : fromCents(detail.creditLimitCents),
  );
  // Vade süresi METİN: boş kutu ile sıfır ayrı hâller ve `number` state boşluğu temsil edemez.
  const [term, setTerm] = useState(detail.customTermDays === null ? '' : String(detail.customTermDays));

  const termDays = term.trim() === '' ? null : Number(term);
  const gecikme = detail.overdueCount > 0;
  const termGecersiz = termDays !== null && (!Number.isInteger(termDays) || termDays < 1);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Vade / limit"
      subtitle={`${customerName} · karne karar desteğidir`}
      maxWidth={460}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={saving}
          error={error}
          blockedReason={termGecersiz ? 'Vade süresi en az 1 gün olmalı.' : null}
        />
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            creditEnabled: enabled,
            creditLimitCents: limitEuro === null ? null : toCents(limitEuro),
            paymentTermDays: termDays,
          });
        }}
        className="flex flex-col gap-4"
      >
        {/* ÜÇ DAYANAK TEK KUTUDA (tasarım) — limit yazılırken bunları görmemek körlemesine karar
            vermektir. Kutunun rengi durumu da söyler: gecikme varsa kırmızı. Üç ayrı gri kart olarak
            yazılmışlardı; tasarım tek kutu içinde satır-içi üç değer veriyor. */}
        <div
          className={`flex flex-wrap gap-x-6 gap-y-2 rounded-ops-card border px-3.5 py-2.5 ${
            gecikme ? 'border-ops-red-line bg-ops-red-bg' : 'border-ops-line bg-ops-subtle'
          }`}
        >
          <InlineMetric
            size="md"
            label="Ort. ödeme"
            value={detail.avgPaymentDays === null ? '—' : `${detail.avgPaymentDays > 0 ? '+' : ''}${detail.avgPaymentDays} gün`}
            tone={detail.latePaymentCount > 0 ? 'red' : undefined}
          />
          <InlineMetric
            size="md"
            label="Gecikme"
            value={detail.latePaymentCount > 0 ? `${detail.latePaymentCount} kez` : 'yok'}
            tone={detail.latePaymentCount > 0 ? 'red' : undefined}
          />
          <InlineMetric size="md" label="Açık bakiye" value={money(detail.openBalanceCents)} tone={gecikme ? 'red' : undefined} />
        </div>

        <ToggleField label="Vade yetkisi" on={enabled} onChange={setEnabled} />

        {/* Limit ve süre YAN YANA (tasarım): ikisi tek kararın iki yarısı ve alt alta dizilmeleri
            diyaloğu gereksiz uzatıyordu. */}
        <div className="flex flex-wrap gap-3">
          <MoneyField
            label="Limit (€)"
            fieldClassName="min-w-[150px] flex-1"
            value={limitEuro}
            onChange={setLimitEuro}
            disabled={!enabled || saving}
            placeholder="örn. 500,00"
          />
          <FieldShell
            label="Vade süresi (gün)"
            className="min-w-[130px] flex-1"
            error={termGecersiz ? 'En az 1 gün olmalı.' : undefined}
          >
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              inputMode="numeric"
              mono
              placeholder={String(detail.defaultTermDays)}
              disabled={!enabled || saving}
              error={termGecersiz ? 'x' : undefined}
            />
          </FieldShell>
        </div>

        {/* KAPANIŞ NOTU (tasarım) — dört ayrı alan-altı paragraf yerine tek yerde. Boş alanların ne
            demek olduğu ve gecikmenin sistem freni burada söyleniyor. */}
        <p className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
          Sistem karneyi gösterir, kararı siz verirsiniz. Limit boş bırakılırsa{' '}
          <strong>sınırsız değil</strong> — önceden onaylanmış tutar olmadığı için her vadeli sipariş onaya
          düşer. Süre boşsa genel varsayılan ({detail.defaultTermDays} gün) geçerlidir.
          {gecikme
            ? ' Gecikmiş müşteride vadeli seçenek checkout’ta zaten otomatik kapanır; burada ayrıca kapatmanız gerekmez.'
            : ''}
        </p>
      </form>
    </Dialog>
  );
}

