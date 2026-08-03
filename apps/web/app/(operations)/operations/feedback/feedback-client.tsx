'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { KeysetCursor } from '@lezzet/types';
import { productsUrl } from '../products/products-url';
import { loadMoreReviewsAction, moderateReviewAction } from './actions';
import { FeedbackDesktop } from './feedback.desktop';
import { FeedbackMobile } from './feedback.mobile';
import { PointsAdjustDialog } from './points-adjust-dialog';
import { feedbackUrl, type FeedbackTab, type FeedbackUrlState, type ReviewStack, type ScoreDirection } from './feedback-url';
import type { FeedbackData, ModerationCardView } from './feedback-types';

// Geri Bildirim ekranı client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil çatallanır.
//
// SEKME ve YIĞIN gerçek gezinmedir (`?tab=…&rs=…`): veriyi sunucu okuyor ve "aday panosuna bak"
// bağlantısı paylaşılabilir olmalı. İstemci durumunda tutulsaydı her sekme bir istemci turu olur,
// bağlantı de daima moderasyonda açılırdı.

interface FeedbackClientProps {
  data: FeedbackData;
  device: Device;
  urlState: FeedbackUrlState;
}

export function FeedbackClient({ data, device, urlState }: FeedbackClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Elle puan düzeltmesi açık olan müşteri — çizimdeki modal tek müşteriye çalışır. */
  const [adjusting, setAdjusting] = useState<{ customerId: string; customerName: string } | null>(null);

  const go = (next: Partial<FeedbackUrlState>) => {
    setError(null);
    startNav(() => router.push(feedbackUrl({ ...urlState, ...next })));
  };

  /**
   * Moderasyon kararı. Sonuç sunucudan TAZELENEREK gelir (`revalidatePath`), satır istemcide
   * silinmez: karar iki yeri birden değiştiriyor (kart kuyruktan düşer + sekme rozeti azalır) ve
   * yalnız satırı gizlemek rozeti bayat bırakırdı — operatör "3 bekliyor" görüp boş kuyruk bulurdu.
   */
  const moderate = (reviewId: string, to: 'approved' | 'rejected') => {
    setError(null);
    startAction(async () => {
      const result = await moderateReviewAction(reviewId, to);
      if (result.error) setError(result.error);
    });
  };

  /**
   * Kuyruğun devamı (keyset). Sunucudan gelen ilk sayfanın üstüne EKLENİR, yerine geçmez.
   *
   * Eklenen sayfalar ayrı durumda tutuluyor çünkü `data` her tazelemede sunucudan yeniden geliyor:
   * bir yorum onaylandığında liste başa döner ve bu doğru — kart kuyruktan düştüğü için devamı da
   * kaymıştır, eski sayfaları korumak silinmiş bir satırı ekranda bırakırdı.
   */
  const [extraRows, setExtraRows] = useState<ModerationCardView[]>([]);
  const [cursor, setCursor] = useState<KeysetCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Sunucudan gelen sayfa değiştiğinde (sekme/yığın değişimi ya da tazeleme) biriken sayfalar düşer.
  const serverCursor = data.moderation?.nextCursor ?? null;
  const [seenCursor, setSeenCursor] = useState(serverCursor);
  if (seenCursor !== serverCursor) {
    setSeenCursor(serverCursor);
    setExtraRows([]);
    setCursor(null);
  }

  const activeCursor = cursor ?? serverCursor;

  const loadMore = () => {
    if (!activeCursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreReviewsAction(urlState.rs, activeCursor)
      .then((result) => {
        if (result.error || !result.data) {
          setError(result.error ?? 'Sonraki sayfa okunamadı.');
          return;
        }
        setExtraRows((prev) => [...prev, ...result.data!.rows]);
        setCursor(result.data.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const moderation = data.moderation ? { ...data.moderation, rows: [...data.moderation.rows, ...extraRows] } : null;

  const view = {
    data: { ...data, moderation },
    urlState,
    busy: navPending || actionPending,
    error,
    hasMore: activeCursor !== null,
    loadingMore,
    onLoadMore: loadMore,
    onTab: (tab: FeedbackTab) => go({ tab }),
    onStack: (rs: ReviewStack) => go({ rs }),
    onScoreDirection: (sd: ScoreDirection) => go({ sd }),
    onModerate: moderate,
    onAdjustPoints: (customerId: string, customerName: string) => setAdjusting({ customerId, customerName }),
    /**
     * "Satışa aç →" — adayı ürün yönetiminde açar (`admin-geri-bildirim.md §5` köprüsü).
     *
     * Köprü ADIYLA kuruluyor, kimlikle değil: Ürünler ekranının adres sözleşmesi bir ürünü
     * kimliğiyle açmıyor (`ProductsUrlState`: sekme + arama + süzgeçler). Ad araması operatörü
     * doğru satıra indiriyor; kimlikle açan bir yol o ekranda doğduğunda burası ona geçer.
     */
    onActivate: (productId: string) => {
      const name = data.candidates?.find((c) => c.productId === productId)?.productName ?? '';
      startNav(() => router.push(productsUrl({ tab: 'products', q: name, cat: 'all', status: 'all', incomplete: false, creating: false })));
    },
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <FeedbackMobile {...view} /> : <FeedbackDesktop {...view} />}
      {adjusting ? (
        <PointsAdjustDialog
          customerId={adjusting.customerId}
          customerName={adjusting.customerName}
          currentBalance={data.points?.find((p) => p.customerId === adjusting.customerId)?.balance ?? 0}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
    </>
  );
}

/** İki cihaz görünümünün ortak sözleşmesi — ikisi de AYNI durumu alır, yalnız dizilim değişir. */
export interface FeedbackViewProps {
  data: FeedbackData;
  urlState: FeedbackUrlState;
  busy: boolean;
  error: string | null;
  /** Kuyruğun devamı var mı (imleç null değil) — nöbetçi buna göre çizilir. */
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onTab: (tab: FeedbackTab) => void;
  onStack: (rs: ReviewStack) => void;
  /** Skor tablosunun yönünü değiştirir (en sevilen ↔ en sevilmeyen). */
  onScoreDirection: (sd: ScoreDirection) => void;
  onModerate: (reviewId: string, to: 'approved' | 'rejected') => void;
  /** Elle puan düzeltmesini açar — yalnız masaüstünde çağrılır (mobilde form yok). */
  onAdjustPoints: (customerId: string, customerName: string) => void;
  /** Adayı ürün yönetiminde açar (aday panosunun tek eylemi). */
  onActivate: (productId: string) => void;
}
