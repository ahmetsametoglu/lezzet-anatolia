import { useCallback, useEffect, useRef, useState } from 'react';

import { createSupplyDraft, fetchSupplyGroups } from '@/lib/api/management';
import type { SupplyGroup } from '@lezzet/types';

/*
  Y4 · TEDARİK ÖNERİSİ KANCASI (21.12) — grup listesi + grup onayından taslak TS.

  Onay grup KİMLİĞİYLE gider (depo + tedarikçi), kalem listesiyle değil: sunucu öneriyi onay
  anında yeniden hesaplar (sözleşme künyesi). `no_suggestion` bir hata değil "ekran bayattı"
  cevabıdır — liste yeniden okunur ve grup kendiliğinden düşer.
*/

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; groups: SupplyGroup[] };

/** Grup anahtarı — tedarikçisiz gruplar onaysızdır, anahtar yalnız eşlenmişlere gerekir. */
export function supplyGroupKey(group: Pick<SupplyGroup, 'warehouseId' | 'supplierId'>): string {
  return `${group.warehouseId}:${group.supplierId ?? 'unmapped'}`;
}

type DraftState = { status: 'sending' } | { status: 'done'; itemCount: number } | { status: 'stale' };

interface UseSupplyResult {
  state: ListState;
  drafts: Record<string, DraftState>;
  approve: (group: SupplyGroup) => void;
  retry: () => void;
}

export function useSupply(): UseSupplyResult {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = ++generation.current;
    setState({ status: 'loading' });
    const result = await fetchSupplyGroups();
    if (run !== generation.current) return;
    setState(
      result.error !== null || result.data === null
        ? { status: 'error' }
        : { status: 'ready', groups: result.data.groups },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = (group: SupplyGroup) => {
    if (group.supplierId === null) return; // eşlenmemiş grup onaylanamaz — ekran düğme de çizmez
    const key = supplyGroupKey(group);
    const current = drafts[key];
    if (current?.status === 'sending' || current?.status === 'done') return;

    setDrafts((prev) => ({ ...prev, [key]: { status: 'sending' } }));
    void (async () => {
      const result = await createSupplyDraft({ warehouseId: group.warehouseId, supplierId: group.supplierId! });
      if (result.error !== null || result.data === null) {
        // Yazım düştü: durum sıfırlanır, düğme yeniden denenebilir hâlde kalır.
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }
      const outcome = result.data;
      if (outcome.status === 'no_suggestion') {
        setDrafts((prev) => ({ ...prev, [key]: { status: 'stale' } }));
        void load();
        return;
      }
      setDrafts((prev) => ({ ...prev, [key]: { status: 'done', itemCount: outcome.itemCount } }));
    })();
  };

  return { state, drafts, approve, retry: () => void load() };
}
