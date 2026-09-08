import { useCallback, useEffect, useState } from 'react';

import { approveB2bApplication, fetchB2bCheck, fetchB2bSummary, rejectB2bApplication } from '@/lib/api/management';
import type { ApiFail } from '@/lib/api/client';
import type { B2bCheckResponse, B2bDecisionResponse } from '@lezzet/types';

/** Kararın sonrasındaki hâl — sözleşmeden türüyor, elle yazılmıyor (CLAUDE §1). */
type B2bApplicationStatus = NonNullable<B2bDecisionResponse['status']>;

/*
  KONTROL KARTI (21.217) — okuma + iki karar.

  Kart web'in müşteri panelindeki diyalogla AYNI okumadan besleniyor (`readB2bCheck`); ekran hiçbir
  sinyali kendi hesaplamıyor. Bayrak da oradan geliyor, yani liste, kart ve masaüstü üç yüzey tek
  hesabı okuyor — biri "Temiz" derken öteki "Mükerrer" diyemez.
*/

type Check = NonNullable<B2bCheckResponse['check']>;

export type B2bCheckState =
  | { status: 'loading' }
  | { status: 'error'; failure: ApiFail | null }
  /** `check: null` = kayıt yok (bildirim bayat, müşteri silinmiş) — ekran "bulunamadı" çizer. */
  | { status: 'ready'; check: Check | null };

/** Kararın akıbeti — ekran cümlesini bundan yazıyor; `null` = henüz karar denenmedi. */
export type B2bDecisionOutcome =
  | { kind: 'sending' }
  | { kind: 'done'; status: B2bApplicationStatus }
  | { kind: 'stale'; status: B2bApplicationStatus }
  | { kind: 'not_found' }
  | { kind: 'failed' };

/**
 * Asistan özetinin ÜÇ hâli — ve üçü de ayrı çünkü ekran üçünü ayrı çiziyor (21.285).
 *
 * `pending` "henüz istendi" demektir, "yok" değil: ikisini tek hâle indirmek, kart açılır açılmaz
 * "üretilemedi" yazdırırdı ve model saniyeler sonra döndüğünde cümle yerinden zıplardı.
 */
export type B2bSummaryState = { kind: 'pending' } | { kind: 'ready'; summary: string } | { kind: 'empty' };

export interface UseB2bCheckResult {
  state: B2bCheckState;
  summary: B2bSummaryState;
  outcome: B2bDecisionOutcome | null;
  approve: () => void;
  reject: (reason: string) => void;
  retry: () => void;
}

export function useB2bCheck(customerId: string): UseB2bCheckResult {
  const [state, setState] = useState<B2bCheckState>({ status: 'loading' });
  const [summary, setSummary] = useState<B2bSummaryState>({ kind: 'pending' });
  const [outcome, setOutcome] = useState<B2bDecisionOutcome | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const result = await fetchB2bCheck(customerId);
    setState(result.error !== null ? { status: 'error', failure: result } : { status: 'ready', check: result.data.check });
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    ÖZET KARTTAN SONRA VE AYRI (21.285) — sırası taşıyıcı.

    Model çağrısı saniye mertebesinde; tek okumada birleştirilseydi operatör kararın dayanağını
    görmek için modelin dönmesini beklerdi. Burada kart kendi hızıyla çiziliyor, özet arkadan
    düşüyor. Uç ayrıca dış servisleri BİR KEZ DAHA sormuyor (künyesi `application/b2b/summary.ts`),
    yani ikinci okuma kart başına ikinci bir SIRET/VIES turu açmıyor.

    Düşerse `empty`: operatörün yapacağı şey her iki hâlde de aynı — sinyalleri yukarıdan okumak.
    Bir "tekrar dene" düğmesi, kararın dayanağı olmayan bir kolaylık için ekrana ikinci bir kapı
    koymak olurdu.
  */
  useEffect(() => {
    let iptal = false;
    setSummary({ kind: 'pending' });
    void (async () => {
      const result = await fetchB2bSummary(customerId);
      if (iptal) return;
      const cumle = result.error === null ? result.data.summary : null;
      setSummary(cumle === null ? { kind: 'empty' } : { kind: 'ready', summary: cumle });
    })();
    return () => {
      iptal = true;
    };
  }, [customerId]);

  /*
    İKİ KARARIN ORTAK GÖVDESİ. Yazım başarılıysa kart YENİDEN OKUNMUYOR: uç kararın sonrasındaki
    hâli zaten döndürüyor ve ikinci bir tur, dış servisleri bir kez daha sorardı (kart açılışı
    tazeliyor — künyesi `b2b/check.ts`te). Ekran rozetini cevaptan güncelliyor.
  */
  const karar = useCallback(
    (calistir: () => ReturnType<typeof approveB2bApplication>) => {
      setOutcome({ kind: 'sending' });
      void (async () => {
        const result = await calistir();
        if (result.error !== null) {
          setOutcome({ kind: 'failed' });
          return;
        }
        const { result: sonuc, status } = result.data;
        if (sonuc === 'not_found') {
          setOutcome({ kind: 'not_found' });
          return;
        }
        if (status !== null) {
          setState((onceki) =>
            onceki.status === 'ready' && onceki.check !== null
              ? { status: 'ready', check: { ...onceki.check, status } }
              : onceki,
          );
        }
        setOutcome(sonuc === 'already_decided' ? { kind: 'stale', status: status ?? 'none' } : { kind: 'done', status: status ?? 'none' });
      })();
    },
    [],
  );

  return {
    state,
    summary,
    outcome,
    approve: () => karar(() => approveB2bApplication(customerId)),
    reject: (reason: string) => karar(() => rejectB2bApplication(customerId, reason)),
    retry: () => void load(),
  };
}
