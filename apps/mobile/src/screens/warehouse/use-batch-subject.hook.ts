import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResolvedBatchContract } from '@lezzet/types';

import { fetchWarehouseBatches } from '@/lib/api/warehouse';
import { trackWarehouse } from './warehouse-status';

/*
  EKRANIN KONUSU: HANGİ PARTİ (D4 · D4b) — 02.09.

  ── NEDEN TEK HOOK, İKİ EKRAN ───────────────────────────────────────────────
  Sayım ile stok düşümü aynı soruyla başlıyor ("hangi parti") ve aynı üç yolu tanıyor: raftaki
  etiketi okut · raf listesinden seç · seçtiğinden vazgeç. İki ekrana ayrı ayrı yazılsaydı arama
  gecikmesi, kırpma uyarısı ve "seçimi bırak" davranışı bir gün ayrışırdı — depocu hangi ekrandan
  geldiğine göre başka bir liste görürdü (CLAUDE §1).

  Bu hook YAZMAYI BİLMEZ: sebep, adet, not `use-adjustment`ta durur. Ayrım işlevsel — konusu henüz
  seçilmemiş bir ekranda yazma durumu taşımak, ekranın hangi hâlde olduğunu bulanıklaştırırdı.

  ── LİSTE ANINDA OKUNUR, ARAMA GECİKMELİ ────────────────────────────────────
  Ekran açılır açılmaz ilk pencere okunuyor: depocu karşısında bir liste bulmalı, aramaya ancak
  göremezse başvurmalı. Sonraki turlar GECİKMELİ (`SEARCH_DEBOUNCE_MS`) — her tuşta bir istek,
  rampadaki telefonda dört harflik bir aramayı dört tura çıkarırdı.

  ── GEÇ DÖNEN CEVAP YENİSİNİ EZMEZ ──────────────────────────────────────────
  Sayaçlı koruma (`generation`) okutma hook'undaki ile aynı gerekçeyle: "bakl" turu "baklava"
  turundan sonra dönerse ekranda eski liste kalırdı ve kimse bunun neden olduğunu bilemezdi.
*/

/** Arama turları arası bekleme (ms) — parametrik, çağıran değiştirebilir. */
export const SEARCH_DEBOUNCE_MS = 300;

type SubjectStatus = 'loading' | 'error' | 'ready';

export interface UseBatchSubjectResult {
  /** Ekranın KONUSU; `null` = henüz seçilmedi ve ekran seçiciyi çizer. */
  subject: ResolvedBatchContract | null;
  select: (batch: ResolvedBatchContract) => void;
  /** Seçimi bırakır — bağlam kartındaki "değiştir". */
  clear: () => void;
  query: string;
  setQuery: (query: string) => void;
  status: SubjectStatus;
  batches: readonly ResolvedBatchContract[];
  /** Tavana dayanıldı — liste TAM DEĞİL; ekran "aramayla daralt" der (CLAUDE §1). */
  truncated: boolean;
  reload: () => void;
}

export function useBatchSubject(): UseBatchSubjectResult {
  const [subject, setSubject] = useState<ResolvedBatchContract | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SubjectStatus>('loading');
  const [batches, setBatches] = useState<readonly ResolvedBatchContract[]>([]);
  const [truncated, setTruncated] = useState(false);
  /** Elle tazeleme sayacı — "tekrar dene" aynı sorguyu yeniden koşturur. */
  const [reloadKey, setReloadKey] = useState(0);

  const generation = useRef(0);

  useEffect(() => {
    // Konu seçilmişken liste okunmaz: ekran o hâlde seçiciyi çizmiyor ve arka planda tel açmak,
    // görünmeyen bir listeyi tazelemek olurdu.
    if (subject !== null) return;

    let cancelled = false;
    // İlk pencere BEKLETİLMEZ: boş sorguda gecikme, ekranı bir çeyrek saniye boş göstermek olurdu.
    const delay = query.trim().length === 0 ? 0 : SEARCH_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      void (async () => {
        const run = (generation.current += 1);
        setStatus('loading');
        const result = await trackWarehouse(fetchWarehouseBatches(query.trim()));
        if (cancelled || run !== generation.current) return;

        if (result.error !== null) {
          setStatus('error');
          return;
        }
        setBatches(result.data.batches);
        setTruncated(result.data.truncated);
        setStatus('ready');
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, reloadKey, subject]);

  const select = useCallback((batch: ResolvedBatchContract) => setSubject(batch), []);

  /**
   * Seçimi bırakırken ARAMA DA SIFIRLANIR: depocu bir partiyi bırakıyorsa aradığı başkasıdır ve
   * eski terimin süzdüğü listeye dönmek, "listede yok" izlenimi verirdi.
   */
  const clear = useCallback(() => {
    setSubject(null);
    setQuery('');
  }, []);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { subject, select, clear, query, setQuery, status, batches, truncated, reload };
}
