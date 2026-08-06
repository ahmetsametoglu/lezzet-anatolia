'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HEALTH_COLLECT_INTERVAL_MIN } from '@lezzet/domain-core';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { resolveErrorAction } from './actions';
import { ErrorDetailDialog } from './components/error-detail-dialog';
import { SystemDesktop } from './system.desktop';
import { systemUrl, type ErrorTab, type SystemUrlState, type TrendWindow } from './system-url';
import type { SystemData } from './system-types';

/**
 * Sistem ekranı client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız (06.08);
 * mobil deneyim native uygulamada — `docs/uygulama`.
 *
 * İki zamanlı iş var ve ikisi de ekranın DÜRÜSTLÜĞÜ için:
 *  1. **Ölçüm yaşı ilerler.** Sunucudan gelen "2 dk önce" donmuş bir sayıdır; sekme açık kalırsa
 *     yirmi dakika sonra hâlâ "2 dk önce" der ve bayat bir görüntü canlı sanılır. Yaş burada
 *     ilerletilir, hüküm de bayatlayınca kendiliğinden döner.
 *  2. **Otomatik tazeleme ölçüme HİZALI.** Toplama saatin çift dakikalarında koşuyor; sabit aralıklı
 *     bir yenileme, ölçümün hemen öncesine denk gelip ekranı bir tur eski tutardı. Geri sayım da bu
 *     yüzden gerçek: bir sonraki ÖLÇÜM ne zaman yazılacak.
 */

/** Ölçüm yazıldıktan sonra okumaya küçük pay — cron tetiklendiği anda satır henüz yazılmamış olur. */
const REFRESH_LAG_SEC = 6;

// Saatin bir sonraki çift dakikasına (cron aralığı) kalan saniye + yazma payı.
function nextCollectSeconds(now: number): number {
  const aralik = HEALTH_COLLECT_INTERVAL_MIN * 60_000;
  const sonraki = Math.ceil(now / aralik) * aralik + REFRESH_LAG_SEC * 1000;
  return Math.max(1, Math.round((sonraki - now) / 1000));
}

interface SystemClientProps {
  data: SystemData;
  serverAgeMinutes: number | null;
  urlState: SystemUrlState;
}

export function SystemClient({ data, serverAgeMinutes, urlState }: SystemClientProps) {
  const router = useRouter();
  const [pending, startNav] = useTransition();

  const applyUrl = useCallback(
    (patch: Partial<SystemUrlState>) => {
      startNav(() => router.replace(systemUrl({ ...urlState, ...patch }), { scroll: false }));
    },
    [router, urlState],
  );

  // ── Arama: giriş yerel, URL'e gecikmeli — mekanizma ortak (`useSearchDraft`) ──
  // Arama daralınca sayfa BAŞA döner: üçüncü sayfadayken süzgeç değişirse sonuç kümesi küçülür ve
  // operatör var olmayan bir sayfaya bakardı.
  const { draft: search, onDraft: onSearch } = useSearchDraft(urlState.q, (q) => applyUrl({ q, page: 0 }));

  // ── Ölçüm yaşı: sunucudan gelen değer + mount'tan bu yana geçen süre ──
  // İlk boyamada sunucununkiyle AYNI olmalı (hidrasyon), sonra kendi kendine ilerler.
  const [ageMinutes, setAgeMinutes] = useState<number | null>(serverAgeMinutes);
  useEffect(() => {
    setAgeMinutes(serverAgeMinutes);
    if (serverAgeMinutes === null) return;
    const basladi = Date.now();
    const t = setInterval(() => setAgeMinutes(serverAgeMinutes + (Date.now() - basladi) / 60_000), 10_000);
    return () => clearInterval(t);
  }, [serverAgeMinutes]);

  // ── Canlı tazeleme ──
  const [liveActive, setLiveActive] = useState(true);
  // Başlangıç değeri SABİT: `Date.now()` ile kurulsaydı sunucu ve istemci farklı sayı basardı.
  const [secondsLeft, setSecondsLeft] = useState(HEALTH_COLLECT_INTERVAL_MIN * 60);
  useEffect(() => {
    if (!liveActive) return;
    setSecondsLeft(nextCollectSeconds(Date.now()));
    const t = setInterval(() => {
      const kalan = nextCollectSeconds(Date.now());
      setSecondsLeft(kalan);
      // Yeni ölçüm penceresine girildi: sunucudan taze oku. `refresh` yalnız RSC'yi yeniler —
      // istemci durumu (seçim, görünüm, arama kutusu) korunur.
      if (kalan >= HEALTH_COLLECT_INTERVAL_MIN * 60 - 1) router.refresh();
    }, 1000);
    return () => clearInterval(t);
  }, [liveActive, router]);

  // ── Seçim ve detay ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Sayfa/sekme değişince seçim ve açık detay düşer: listede olmayan bir kaydın detayı, ekranın
  // gösterdiği kümeyle çelişir.
  useEffect(() => {
    setSelectedId(null);
    setOpenId(null);
  }, [urlState.tab, urlState.page, urlState.q]);

  // ── "Çözüldü" işareti ──
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const onResolve = (id: string) => {
    setResolving(id);
    setResolveError(null);
    void resolveErrorAction(id)
      .then(({ error }) => {
        // Hata YUTULMAZ: düşen bir işaretleme, operatörün kapattığını sandığı bir hatadır ve o hata
        // bir dahaki bakışta yine listede durur — sebebini bilmeden.
        if (error) {
          setResolveError(error);
          return;
        }
        setOpenId(null);
        // `revalidatePath` action'da çağrıldı; `refresh` onu bu sekmeye indirir (sayaçlar da döner).
        router.refresh();
      })
      .finally(() => setResolving(null));
  };

  const view = {
    data,
    urlState,
    search,
    onSearch,
    onTab: (tab: ErrorTab) => applyUrl({ tab, page: 0 }),
    onWindow: (win: TrendWindow) => applyUrl({ win }),
    onPage: (page: number) => applyUrl({ page }),
    navPending: pending,
    live: {
      active: liveActive,
      secondsLeft,
      onToggle: () => setLiveActive((v) => !v),
      onRefreshNow: () => router.refresh(),
    },
    ageMinutes,
    selectedId,
    onSelect: setSelectedId,
    openId,
    onOpen: setOpenId,
    onResolve,
    resolving,
    resolveError,
  };

  const acik = openId ? (data.errors.find((r) => r.id === openId) ?? null) : null;

  return (
    <>
      <SystemDesktop {...view} />
      {acik ? (
        <ErrorDetailDialog
          key={acik.id}
          row={acik}
          onClose={() => setOpenId(null)}
          onResolve={onResolve}
          resolving={resolving === acik.id}
        />
      ) : null}
    </>
  );
}
