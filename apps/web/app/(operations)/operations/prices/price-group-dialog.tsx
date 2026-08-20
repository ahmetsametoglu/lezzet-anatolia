'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { InputField } from '@/components/operation/form/input';
import { deletePriceGroupAction, savePriceGroupAction } from './actions';
import type { PriceGroupRow } from './prices-types';

// Fiyat grubu — ekleme ve düzenleme AYNI diyalog (20.08, B2B alt kademeleri).
//
// Grup bir İNDİRİM değil FİYAT kademesidir: yüzde B2B listeden düşülür ve motor sırayla çözer
// (müşteriye özel → grup → liste). Yüzdeyi değiştirmek üye SAYISI kadar müşteriyi anında etkiler —
// üye sayısı bu yüzden diyalogda okunur durur.
//
// Silme iki adımlı; üyesi olan grubu DB `restrict` FK'si zaten korur ve hata operatöre cümle
// olarak döner ("önce müşterileri taşı") — sessiz yarım silme yok.

interface PriceGroupDialogProps {
  /** Dolu → düzenleme; boş → yeni grup. */
  editing: PriceGroupRow | null;
  onClose: () => void;
}

export function PriceGroupDialog({ editing, onClose }: PriceGroupDialogProps) {
  const router = useRouter();
  const isEdit = editing !== null;
  const [name, setName] = useState(editing?.name ?? '');
  const [percentText, setPercentText] = useState(editing ? String(editing.percentOff) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const percentOff = Number(percentText.replace(',', '.'));
  const valid = name.trim().length > 0 && Number.isFinite(percentOff) && percentOff > 0 && percentOff < 100;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await savePriceGroupAction(editing?.id ?? null, name.trim(), percentOff);
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onClose();
  };

  const remove = async () => {
    if (busy || !editing) return;
    if (!confirming) return setConfirming(true);
    setBusy(true);
    setError(null);
    const res = await deletePriceGroupAction(editing.id);
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onClose();
  };

  return (
    <Dialog open title={isEdit ? 'Fiyat grubunu düzenle' : 'Yeni fiyat grubu'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="font-ops-body text-ops-sm leading-relaxed text-ops-muted">
          Grup, B2B liste fiyatından yüzde düşer (market · restoran/pastane gibi kademeler). Bu bir
          kampanya değildir: kampanyayla yarışmaz, müşteri kendi fiyatını görür. Üyelik müşteri
          kartından atanır.
        </p>

        <InputField
          label="Grup adı"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Market"
        />

        <InputField
          label="Listeden düşülen yüzde"
          required
          mono
          value={percentText}
          onChange={(e) => setPercentText(e.target.value)}
          placeholder="5"
          labelAside={isEdit ? `${editing.memberCount} üye — değişiklik hepsine anında yansır` : undefined}
          error={percentText !== '' && !Number.isFinite(percentOff) ? 'Sayı girin' : undefined}
        />

        {error && <p className="font-ops-body text-ops-sm text-ops-red">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          {isEdit ? (
            <Button variant="danger" size="sm" disabled={busy} onClick={remove}>
              {confirming ? 'Emin misiniz? Grubu sil' : 'Grubu sil'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="primary" onClick={save} disabled={!valid || busy}>
              {isEdit ? 'Kaydet' : 'Grubu aç'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
