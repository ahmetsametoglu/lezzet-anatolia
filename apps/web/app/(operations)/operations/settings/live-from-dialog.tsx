'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { DateField } from '@/components/operation/form/date-field';
import { DialogError } from './settings-sections';
import { useDialogAction } from './use-dialog-action.hook';

interface LiveFromDialogProps {
  open: boolean;
  /** Girilmiş gün; `null` = entegrasyon kapalı. */
  value: string | null;
  subtitle: string;
  /** Günü silen düğmenin adı; yalnız gün girilmişken görünür. */
  offLabel: string;
  onSave: (date: string | null) => Promise<{ error: string | null }>;
  onClose: () => void;
}

/** Entegrasyonun canlıya geçiş günü; kasa ve muhasebe kartı aynı pencereyi açar. */
export function LiveFromDialog({ open, value, subtitle, offLabel, onSave, onClose }: LiveFromDialogProps) {
  const [date, setDate] = useState('');
  const [loaded, setLoaded] = useState(false);
  const { busy, error, run, clearError } = useDialogAction(onClose);

  // Pencere her açılışta güncel değerle dolar; önceki açılıştan kalan seçim ya da hata gösterilmez.
  if (open !== loaded) {
    setLoaded(open);
    if (open) {
      setDate(value ?? '');
      clearError();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Canlıya geçiş"
      subtitle={subtitle}
      footer={
        <>
          {value ? (
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => onSave(null))}>
              {offLabel}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button variant="dark" disabled={busy || date === ''} onClick={() => void run(() => onSave(date))}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <DateField label="Gün" value={date} onChange={setDate} clearable={false} />
        <DialogError error={error} />
      </div>
    </Dialog>
  );
}
