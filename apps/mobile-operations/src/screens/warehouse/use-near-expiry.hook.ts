import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { NearExpiryBatchContract } from '@lezzet/types';

import { fetchNearExpiry, recordAdjustment } from '@/lib/api/warehouse';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
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
   * İMHA EDİLEN PARTİLER — `stockId` → olay referansı (`IMH-STR-26-…`).
   *
   * Liste YENİDEN OKUNMUYOR ve bu bilinçli: kabul yazıldıktan sonra o parti artık listede
   * olmayacak, ama depocu ne yaptığını görmeli. Satır yerinde kalıp "İMHA EDİLDİ" diyor ve
   * referansı taşıyor — ekran kapanmıyor, tur devam ediyor (tasarım: *"satır 'imha edildi'ye
   * döner · aynı ekranda kalır"*).
   */
  discarded: Record<string, string>;
  /** İmha yazılıyor mu — düğme iki kez basılmasın. */
  discarding: boolean;
  /** Yazılamadıysa operatöre gösterilecek cümle; `null` = sorun yok. */
  discardError: string | null;
  /** Partiyi imha eder; başarıda `discarded`a referansı yazar. */
  discard: (stockId: string, qty: number) => void;
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
  const [discarded, setDiscarded] = useState<Record<string, string>>({});
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

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

  /*
    İMHA — SEBEP SORULMAZ (tasarım 31.08).

    Kapı D4'ün kapısıyla AYNI (`POST /warehouse/adjustments`) ve sebep sabit: `expired`. Yeni bir uç
    açılmadı çünkü yazılan şey aynı: bir partiden adet düşmek. Değişen tek şey sebebin NEREDE
    belirlendiği — burada tarihten türüyor, D4b'de depocu seçiyor.

    Liste yeniden okunmuyor: parti düştükten sonra listede olmayacak ama depocu ne yaptığını
    görmeli. Satır yerinde kalıp referansı taşıyor.
  */
  const discard = useCallback((stockId: string, qty: number) => {
    if (discarding) return;
    setDiscarding(true);
    setDiscardError(null);

    void (async () => {
      const result = await trackWarehouse(
        /* ADET POZİTİF, YÖN AYRI ALANDA (`AdjustmentLineSchema` künyesi): işaret miktara gömülmez.
           İmha bir ÇIKIŞtır — `out`. */
        recordAdjustment({ lines: [{ stockId, qty: Math.abs(qty), direction: 'out' }], reason: 'expired' }),
      );
      setDiscarding(false);

      if (result.error !== null) {
        setDiscardError(fillCopy(warehouseCopy.nearExpiry.discard.failed, { error: result.error }));
        return;
      }
      const outcome = result.data;
      if (outcome.status !== 'ok') {
        /* Kapının HER olumsuz hâli operatöre bir cümleyle döner: `failed` fiziksel gerçeği söyler
           ("partide 3 var, 5 düşülemez"), ötekiler kodu — kod da bir cevaptır, sessizlik değil. */
        const message = outcome.status === 'failed' ? outcome.message : outcome.status;
        setDiscardError(fillCopy(warehouseCopy.nearExpiry.discard.failed, { error: message }));
        return;
      }
      setDiscarded((current) => ({ ...current, [stockId]: outcome.result.referenceNo }));
    })();
  }, [discarding]);

  return {
    status,
    batches,
    discarded,
    discarding,
    discardError,
    discard,
    discardCandidate: batches.find((batch) => batch.decision === 'must_discard') ?? null,
    reload,
  };
}
