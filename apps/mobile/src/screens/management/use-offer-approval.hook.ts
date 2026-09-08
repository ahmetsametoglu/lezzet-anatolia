import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiFail } from '@/lib/api/client';
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

type ListState =
  | { status: 'loading' }
  /** Sebep taşınır (şikâyet kancasının aynı kararı); `null` = 200 ama boş gövde. */
  | { status: 'error'; failure: ApiFail | null }
  | { status: 'ready'; candidates: OfferCandidate[] };

interface UseOfferApprovalResult {
  state: ListState;
  removed: Record<string, boolean>;
  prices: Record<string, string>;
  /** stockId → açılamama sebebi (son onay turundan). */
  failures: Record<string, OfferOpenResult['status']>;
  sending: boolean;
  /**
   * TEK partinin yayını sürerken o partinin kimliği — toplu `sending`den AYRI tutuluyor.
   *
   * Tek bir bayrak olsaydı bir partiyi yayınlarken ALT ÇUBUKTAKİ toplu düğme de kilitlenirdi;
   * oysa ikisi ayrı karar ve ikisi de aynı anda meşru. Kimlik taşınıyor çünkü kilitlenmesi
   * gereken şey "bir düğme" değil, YAYINLANAN partinin kendi düğmesi.
   */
  sendingId: string | null;
  /** Son turda kaç parti açıldı — `null` = bu oturumda henüz onay olmadı. */
  lastOpenedCount: number | null;
  openableCount: number;
  toggleRemoved: (stockId: string) => void;
  setPrice: (stockId: string, value: string) => void;
  submit: () => void;
  /**
   * TEK partiyi yayınlar — çekmecenin "Teklifi yayınla" düğmesi (21.296).
   *
   * Uç zaten çoklu (`items[]`); tek parti onun bir elemanlı hâlidir, ayrı bir kapı AÇILMADI.
   * İkinci bir uç, aynı kararın (DLC kapısı · fiyat doğrulaması) iki yerde yaşaması demekti.
   */
  submitOne: (stockId: string) => void;
  retry: () => void;
  /** Aşağı çekme — listeyi karartmadan tazeler. */
  refresh: () => void;
  /** Çekme sürüyor mu (`state` DEĞİL: o listeyi söküp iskelete çevirirdi). */
  reloading: boolean;
}

export function useOfferApproval(): UseOfferApprovalResult {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState<Record<string, OfferOpenResult['status']>>({});
  const [sending, setSending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [lastOpenedCount, setLastOpenedCount] = useState<number | null>(null);
  const [reloading, setReloading] = useState(false);
  const generation = useRef(0);

  /* `silent`: aşağı çekmede liste yerinde durur (depo hub'ı emsali) — operatörün yazdığı fiyatlar
     zaten korunuyor (alttaki `setPrices` künyesi), ekranı karartmak o korumayı görünmez kılardı. */
  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    const run = ++generation.current;
    if (options.silent !== true) setState({ status: 'loading' });
    const result = await fetchOfferCandidates();
    if (run !== generation.current) return;
    if (result.error !== null || result.data === null) {
      setState({ status: 'error', failure: result.error !== null ? result : null });
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

  /*
    YAZMA TEK YERDE — toplu onay da tek partinin çekmecesi de buradan geçer (21.296).

    İkisi ayrı ayrı yazsaydı akıbet işleme (`failures`), sayaç ve tazeleme iki kopyada yaşardı ve
    biri gün gelip ötekinden saparadı: çekmeceden açılan parti hata alsa da kartında işaret
    görünmezdi. Fark yalnız KİMİN kilitlendiği — onu çağıran söyler.
  */
  const send = (items: OfferCandidate[], lock: () => void, unlock: () => void) => {
    lock();
    void (async () => {
      const result = await openOffers({
        items: items.map((candidate) => ({
          stockId: candidate.stockId,
          // `openable` süzgeci null'ı zaten eledi; buradaki `?? 0` tipin gereği, akışın değil.
          offerPriceCents: parseAmountToCents(prices[candidate.stockId] ?? '') ?? 0,
        })),
      });
      unlock();
      if (result.error !== null || result.data === null) {
        // Yazım turu düşerse liste YERİNDE kalır — operatörün düzeltmeleri kaybolmaz; tekrar dener.
        setLastOpenedCount(0);
        return;
      }
      const failed = result.data.results.filter((row) => row.status !== 'ok');
      /* Akıbet işaretleri BİRİKİR, ezilmez: tek partilik bir tur, önceki turda işaretlenmiş başka
         partilerin işaretini silmemeli — o partiler hâlâ listede ve sebepleri hâlâ geçerli. */
      setFailures((current) => ({ ...current, ...Object.fromEntries(failed.map((row) => [row.stockId, row.status])) }));
      setLastOpenedCount(result.data.results.length - failed.length);
      void load();
    })();
  };

  const submit = () => {
    if (state.status !== 'ready' || sending || openable.length === 0) return;
    send(
      openable,
      () => setSending(true),
      () => setSending(false),
    );
  };

  const submitOne = (stockId: string) => {
    if (state.status !== 'ready' || sendingId !== null) return;
    const candidate = openable.find((row) => row.stockId === stockId);
    // Fiyatı okunamayan ya da turdan çıkarılmış parti `openable`da yok — sessizce geçilir,
    // çünkü çekmecenin düğmesi zaten o hâlde kapalı çiziliyor.
    if (candidate === undefined) return;
    send(
      [candidate],
      () => setSendingId(stockId),
      () => setSendingId(null),
    );
  };

  return {
    state,
    removed,
    prices,
    failures,
    sending,
    sendingId,
    lastOpenedCount,
    openableCount: openable.length,
    toggleRemoved: (stockId) => setRemoved((current) => ({ ...current, [stockId]: current[stockId] !== true })),
    setPrice: (stockId, value) => setPrices((current) => ({ ...current, [stockId]: value })),
    submit,
    submitOne,
    retry: () => void load(),
    refresh: () => {
      setReloading(true);
      void load({ silent: true }).finally(() => setReloading(false));
    },
    reloading,
  };
}
