'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FormInput } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import type { BoxPrinterContract } from '@lezzet/types';
import { addWarehousePrinterAction, setWarehousePrinterActiveAction } from './actions';
import { LABEL_SIZE_OPTIONS } from './warehouses-labels';
import { WarehousePrinterFormSchema, type WarehousePrinterFormInput } from './warehouses-types';

/**
 * **YAZICI ENVANTERİ** (07.12 · 29.08) — deponun etiket yazıcıları.
 *
 * ── NEDEN LİSTE OLDU ────────────────────────────────────────────────────────
 * 23.7'de tek yazıcı vardı ve `settings`in üç anahtarı yetiyordu. Kargo kanalı ikisini de
 * çoğalttı: **iki etiket türü** (bizim 4×6 QR'lı kutu etiketimiz ↔ taşıyıcının A6 yatay etiketi)
 * ve **iki rulo** (QL-1110NWB 102 mm · QL-820NWB 62 mm). Ayarla ifade edilemeyen şey bir listedir.
 *
 * ── BU EKRAN ENVANTERİ YÖNETİR, SEÇİMİ DEĞİL ────────────────────────────────
 * Hangi yazıcının kullanılacağı CİHAZIN bilgisi (kullanıcı kararı 29.08) ve telefonun yerel
 * deposunda yaşıyor. Buradan "varsayılan yazıcı" işaretlemek, cihazın seçimini sunucudan ezmek
 * olurdu — aynı depodaki iki telefon iki ayrı yazıcıya basabilir (biri rampada, biri masada) ve
 * bu bir çelişki değil, kurulumun kendisi.
 *
 * ── SİLME YOK, KAPATMA VAR ──────────────────────────────────────────────────
 * Cihazların seçimi yazıcının KİMLİĞİNE bağlı; satırı silmek o seçimleri sessizce "yazıcı yok"a
 * düşürürdü. Kapatma bunu söyler: satır listede kalır, cihazın seçicisinden düşer.
 *
 * Boy KAPALI listedir (`LABEL_SIZE_OPTIONS` künyesi): takılı kâğıt SDK'dan okunamıyor ve yanlış
 * boy basım anında `SetLabelSizeError` (23.5 ölçümü).
 */
const FORM_ID = 'warehouse-printer-form';

/** Amacın ekrandaki karşılığı — ayrım fiziksel, o yüzden etiket de fiziği anlatıyor. */
const PURPOSE_OPTIONS = [
  { value: 'box', label: 'Kutu etiketi (bizim QR’lı 4×6)' },
  { value: 'shipping', label: 'Kargo etiketi (taşıyıcının A6’sı)' },
];

interface PrinterDialogProps {
  warehouseId: string;
  printers: BoxPrinterContract[];
  onClose: () => void;
  onSaved: () => void;
}

export function PrinterDialog({ warehouseId, printers, onClose, onSaved }: PrinterDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<WarehousePrinterFormInput>({
    resolver: zodResolver(WarehousePrinterFormSchema),
    defaultValues: {
      warehouseId,
      name: '',
      purpose: 'box',
      address: '',
      model: '',
      // Varsayılan 4×6 (karar §1.6'nın etiketi) — yeni kayıt için makul başlangıç.
      labelSize: 'DieCutW103H164',
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: failed } = await addWarehousePrinterAction(values);
    if (failed) {
      setError(failed);
      return;
    }
    form.reset({ ...form.getValues(), name: '', address: '', model: '' });
    onSaved();
  });

  const toggle = async (id: string, isActive: boolean) => {
    setError(null);
    const { error: failed } = await setWarehousePrinterActiveAction({ id, isActive });
    if (failed) {
      setError(failed);
      return;
    }
    onSaved();
  };

  return (
    <Dialog
      open
      title="Etiket yazıcıları"
      subtitle="Kutu etiketi ve kargo etiketi AYRI kâğıtlara basılır. Hangi yazıcıyı kullanacağını telefon kendi seçer."
      maxWidth={620}
      onClose={onClose}
      footer={<DialogFooter formId={FORM_ID} onCancel={onClose} error={error} />}
    >
      <div className="flex flex-col gap-4">
        {/* Mevcut envanter — kapalı satır da görünür: "neden listede yok" sorusunun cevabı burada. */}
        {printers.length === 0 ? (
          <p className="font-ops-body text-ops-sm text-ops-muted">
            Bu depoda tanımlı yazıcı yok — telefon basmayı hiç denemez, etiket kartı önizleme olarak kalır.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {printers.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 border-b border-ops-line pb-1.5">
                <span className="font-ops-body text-ops-sm text-ops-ink">
                  <strong className="font-semibold">{row.name}</strong>{' '}
                  <span className="text-ops-muted">
                    {row.purpose === 'shipping' ? 'kargo' : 'kutu'} · {row.model} · {row.address} · {row.labelSize}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void toggle(row.id, false)}
                  className="cursor-pointer font-ops-body text-ops-xs text-ops-terracotta underline hover:opacity-80"
                >
                  kapat
                </button>
              </li>
            ))}
          </ul>
        )}

        <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
          <FormInput control={form.control} name="name" label="Ad" placeholder="Rampa · QL-820" />
          <FormSelect control={form.control} name="purpose" label="Hangi iş" options={PURPOSE_OPTIONS} />
          <FormInput control={form.control} name="address" label="Ağ adresi (IP)" placeholder="192.168.1.90" />
          <FormInput control={form.control} name="model" label="Model" placeholder="QL-1110NWB" />
          <FormSelect control={form.control} name="labelSize" label="Takılı kâğıt" options={LABEL_SIZE_OPTIONS} />
          {/* Boyun NEDEN sorulduğu yazılı: ayar bir tercih değil, fiziksel gerçeğin beyanı. */}
          <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
            Takılı kâğıt yazıcıdan okunamıyor — boy yanlışsa yazıcı basmayı reddeder. Ruloyu değiştirince burayı da
            güncelleyin. Yazıcı silinmez, kapatılır: telefonların seçimi kimliğe bağlı.
          </p>
        </form>
      </div>
    </Dialog>
  );
}
