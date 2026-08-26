import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchOfferCandidates, openOffers } from '@/lib/api/management';
import { centsToAmountText, parseAmountToCents } from '@/lib/operations/money';
import type { OfferCandidate, OfferOpenResult } from '@lezzet/types';

/*
  Y3 · TEKLİF ONAYI KANCASI (21.12) — aday listesi + operatörün düzeltmeleri + toplu onay.

  ── EKRAN DURUMU İSTEK GÖVDESİDİR ───────────────────────────────────────────
  Çıkarılanlar ve düzeltilmiş fiyatlar yerelde durur; onay anında "listede duran + okunabilir
  fiyatlı" satırlar gövde olur. Boş/bozuk fiyat `null` ayrıştırılır ve o satır GÖNDERİLMEZ
  (CLAUDE §1: boş girdi sıfır değildir — sıfır, bedava satılan parti demekti).

  ── ONAYDAN SONRA LİSTE YENİDEN OKUNUR ──────────────────────────────────────
  Açılan parti motor gereği aday olmaktan çıkar (`offer_open`); taze okuma bunu kendiliğinden
  gösterir. Açılamayanların akıbeti satır işareti olarak kalır (`failures`) — sunucunun satır satır
  cevabı ekranda satır satır görünür, toplu bir "bir şeyler ters gitti"ye indirgenmez.
*/

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; candidates: OfferCandidate[] };

interface UseOfferApprovalResult {
  state: ListState;
  removed: Record<string, boolean>;
  prices: Record<string, string>;
  /** stockId → açılamama sebebi (son onay turundan). */
  failures: Record<string, OfferOpenResult['status']>;
  sending: boolean;
  /** Son turda kaç parti açıldı — `null` = bu oturumda henüz onay olmadı. */
  lastOpenedCount: number | null;
  openableCount: number;
  toggleRemoved: (stockId: string) => void;
  setPrice: (stockId: string, value: string) => void;
  submit: () => void;
  retry: () => void;
}

export function useOfferApproval(): UseOfferApprovalResult {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState<Record<string, OfferOpenResult['status']>>({});
  const [sending, setSending] = useState(false);
  const [lastOpenedCount, setLastOpenedCount] = useState<number | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = ++generation.current;
    setState({ status: 'loading' });
    const result = await fetchOfferCandidates();
    if (run !== generation.current) return;
    if (result.error !== null || result.data === null) {
      setState({ status: 'error' });
      return;
    }
    setState({ status: 'ready', candidates: result.data.candidates });
    // Fiyat alanları motorun önerisiyle DOLU açılır; önerisiz satır boş kalır (operatör yazar).
    // Yeniden okuma operatörün YAZDIĞINI ezmez: alanında değer olan satıra dokunulmaz.
    setPrices((current) => {
      const next = { ...current };
      for (const candidate of result.data.candidates) {
        if (next[candidate.stockId] === undefined) {
          next[candidate.stockId] = candidate.suggestedCents === null ? '' : centsToAmountText(candidate.suggestedCents);
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openable =
    state.status === 'ready'
      ? state.candidates.filter(
          (candidate) =>
            removed[candidate.stockId] !== true && parseAmountToCents(prices[candidate.stockId] ?? '') !== null,
        )
      : [];

  const submit = () => {
    if (state.status !== 'ready' || sending || openable.length === 0) return;
    setSending(true);
    void (async () => {
      const result = await openOffers({
        items: openable.map((candidate) => ({
          stockId: candidate.stockId,
          // `openable` süzgeci null'ı zaten eledi; buradaki `?? 0` tipin gereği, akışın değil.
          offerPriceCents: parseAmountToCents(prices[candidate.stockId] ?? '') ?? 0,
        })),
      });
      setSending(false);
      if (result.error !== null || result.data === null) {
        // Yazım turu düşerse liste YERİNDE kalır — operatörün düzeltmeleri kaybolmaz; tekrar dener.
        setLastOpenedCount(0);
        return;
      }
      const failed = result.data.results.filter((row) => row.status !== 'ok');
      setFailures(Object.fromEntries(failed.map((row) => [row.stockId, row.status])));
      setLastOpenedCount(result.data.results.length - failed.length);
      void load();
    })();
  };

  return {
    state,
    removed,
    prices,
    failures,
    sending,
    lastOpenedCount,
    openableCount: openable.length,
    toggleRemoved: (stockId) => setRemoved((current) => ({ ...current, [stockId]: current[stockId] !== true })),
    setPrice: (stockId, value) => setPrices((current) => ({ ...current, [stockId]: value })),
    submit,
    retry: () => void load(),
  };
}
