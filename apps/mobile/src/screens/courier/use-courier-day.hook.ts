import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { CourierStopContract } from '@lezzet/types';

import { fetchCourierDay, fetchDayCloseDraft } from '@/lib/api/courier';

/*
  GÜNÜN ROTASI (K1) — `/courier/day` + `/courier/day-close`.

  ── NEDEN İKİ OKUMA ─────────────────────────────────────────────────────────
  Tasarımın ilerleme satırı üç şey yazıyor: biten/toplam durak, ilerleme çubuğu ve **cepteki para**
  (v2:63-65). İlk ikisi durak listesinden çıkıyor; üçüncüsü ÇIKMIYOR — `/courier/day` bir durakta
  ne KADAR tahsil edildiğini taşımıyor (yalnız kalan borcu). Tahsil edilmiş toplamın tek dürüst
  kaynağı gün kapanışı taslağının `expected` bloğudur (o da günün tahsilat kayıtlarından türüyor).
  Sayıyı listeden "tahmin etmek" (borcu sıfırlanan durağın tutarını toplamak) önceden ödenmiş
  siparişleri de sayardı ve K7'de sürpriz çıkardı — oysa bu satırın varlık sebebi tam olarak o
  sürprizi önlemek (`design/pages/app-kurye.md` K1).

  ── TASLAK DÜŞERSE LİSTE AYAKTA KALIR, SAYI "BİLİNMİYOR" OLUR ───────────────
  İki okuma birlikte isteniyor ama kaderleri ayrı: rota gelmediyse ekran hata gösterir (gösterecek
  bir şey yok), taslak gelmediyse liste çizilir ve cepteki para `null` döner — okuyan taraf
  "bilinmiyor" yazar. Sıfıra düşürmek dolu bir cebi boş göstermek olurdu (CLAUDE §1).

  ── "YOLA ÇIKTIM" YEREL BİR KAPIDIR, BİR YAZIM DEĞİL ────────────────────────
  Tasarımın kendi davranışı da bu (v2:1091 `basladi` yalnız durum). Sunucu tarafında karşılığı
  `ready → out_for_delivery` geçişidir ve **mobil uçta böyle bir yol YOK** (`/api/v1/courier`
  beşi de teslimat/kapanış uçları — ölçüldü). Kapı yine de anlamlı: sıra kuralını kuryeye kapıda
  hatırlatır ve yanlışlıkla açılan bir durağı engeller. Sunucu aynı kuralı KENDİ de uygular; işaret
  konmamışsa teslim isteği `stale`/`not_allowed` döner ve ekran o reddi GÖSTERİR (yutmaz).
  BEKLEYEN(21.10): "yola çıktım" geçişinin mobil ucu — kapı `transitionOrder` üstünden açılmalı.

  ── ODAKTA TAZELENİR ────────────────────────────────────────────────────────
  Teslimat ekranından dönen kurye, az önce yazdığı sonucu listede GÖRMELİ. `useFocusEffect` ilk
  girişte de koşar, yani tek yükleme yolu var; sonraki dönüşlerde iskelet gösterilmez (liste
  yerinde kalır, sessizce tazelenir) — yoksa her geri dönüş ekranı boşaltırdı.
*/

type CourierDayStatus = 'loading' | 'ready' | 'error';

interface UseCourierDayResult {
  status: CourierDayStatus;
  /** Uçtan gelen gün (`YYYY-MM-DD`) — istemci kendi hesaplamaz. */
  date: string | null;
  stops: CourierStopContract[];
  /** Bugün tahsil edilmiş toplam (cent). `null` = ÖLÇÜLEMEDİ, sıfır değil. */
  collectedCents: number | null;
  /** "Yola çıktım" işaretlendi mi — durak kilidinin kapısı. */
  started: boolean;
  start: () => void;
  reload: () => void;
}

export function useCourierDay(): UseCourierDayResult {
  const [status, setStatus] = useState<CourierDayStatus>('loading');
  const [date, setDate] = useState<string | null>(null);
  const [stops, setStops] = useState<CourierStopContract[]>([]);
  const [collectedCents, setCollectedCents] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  /** Kaçıncı yükün geçerli olduğu — geç gelen eski cevaplar yazılmaz (katalog emsali). */
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);

    const [dayResult, draftResult] = await Promise.all([fetchCourierDay(), fetchDayCloseDraft()]);
    if (run !== generation.current) return;

    if (dayResult.error !== null) {
      setStatus('error');
      return;
    }

    setDate(dayResult.data.date);
    setStops(dayResult.data.stops);
    setCollectedCents(
      draftResult.error !== null
        ? null
        : draftResult.data.expected.cashCents + draftResult.data.expected.cardCents + draftResult.data.expected.chequeCents,
    );
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
    date,
    stops,
    collectedCents,
    started,
    start: useCallback(() => setStarted(true), []),
    reload,
  };
}
