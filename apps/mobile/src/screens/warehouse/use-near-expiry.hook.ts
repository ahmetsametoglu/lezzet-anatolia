import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { NearExpiryBatchContract } from '@lezzet/types';

import { fetchNearExpiry } from '@/lib/api/warehouse';
import { trackWarehouse } from './warehouse-status';

/*
  D3 · YAKIN-SKT TURU — ekranın veri kapısı.

  ── FİKSTÜR SÖKÜLDÜ (21.187) ───────────────────────────────────────────────
  Ekran bugüne kadar `NEAR_EXPIRY_FIXTURE` ile çiziliyordu ve gerekçesi kendi künyesinde yazılıydı:
  *"kapısı yok"*. Motor (`batch-view`) vardı, uç yoktu. Uç açıldı (`/api/v1/warehouse/near-expiry`)
  ve liste artık gerçek partileri taşıyor.

  ── ACİLİYET VE CÜMLE BURADA TÜRETİLİR, KAPIDAN GELMEZ ─────────────────────
  Kapı `daysLeft` sayısını taşıyor; rengin eşiği ve "2 gün" / "−1 gün (geçti)" cümlesi EKRANIN
  kararı. Sözleşmede taşınsaydı aynı eşik iki yerde yaşar ve biri bir gün ötekiyle çelişirdi
  (CLAUDE §1). Kapı ölçer, ekran anlatır.
*/

/** Kalan gün metninin tonu: geçmiş/çok yakın kırmızı, yakın terracotta, uzak nötr. */
export type NearExpiryUrgency = 'expired' | 'soon' | 'calm';

/** Bu kadar günü kalan parti "yakın" sayılır — altı kırmızı, üstü sakin. */
const SOON_DAYS = 7;

/**
 * Aciliyet YALNIZ kalan günden türer, karardan değil.
 *
 * Karar sistemin türettiği EYLEMDİR (teklif · imha), aciliyet ise zamanın kendisi. İkisini tek
 * değere bağlamak, satırda aynı şeyin iki kez söylenmesi olurdu — rozet zaten kararı söylüyor.
 */
export function urgencyOf(daysLeft: number): NearExpiryUrgency {
  if (daysLeft < 0) return 'expired';
  return daysLeft <= SOON_DAYS ? 'soon' : 'calm';
}

export type NearExpiryStatus = 'loading' | 'ready' | 'error';

interface UseNearExpiryResult {
  status: NearExpiryStatus;
  batches: NearExpiryBatchContract[];
  /**
   * İmhalık partilerin İLKİ — alttaki genel düğmenin konusu.
   *
   * `null` = imhalık yok ve düğme çizilmez: konusu olmayan bir düğme, depocuyu D4'e boş elle
   * gönderirdi. Birden çok imhalık varsa satırların KENDİ bağı kullanılır (ekranın künyesi).
   */
  discardCandidate: NearExpiryBatchContract | null;
  reload: () => void;
}

export function useNearExpiry(): UseNearExpiryResult {
  const [status, setStatus] = useState<NearExpiryStatus>('loading');
  const [batches, setBatches] = useState<NearExpiryBatchContract[]>([]);

  /** Kaçıncı yükün geçerli olduğu — geç gelen eski cevap yazılmaz (hub emsali). */
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await trackWarehouse(fetchNearExpiry());
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('error');
      return;
    }
    setBatches(result.data.batches);
    setStatus('ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reload = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  return {
    status,
    batches,
    discardCandidate: batches.find((batch) => batch.decision === 'must_discard') ?? null,
    reload,
  };
}
