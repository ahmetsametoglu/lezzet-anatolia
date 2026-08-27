import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';

/**
 * Bildirim akışının ROTA düzeyinde ilk karesi (Next `loading.tsx`) — sepetin aynı kararı:
 * ilk sayfa SUNUCUDA okunuyor ve iskeletsiz geçiş "sayfa takıldı" gibi duruyordu (kullanıcı
 * bildirimi 26.08: "açılırken bir miktar bekliyor gibi"). İskelet satırı, gelen satırın YENİ
 * anatomisiyle aynı yeri tutar (ikon dairesi + etiket + cümle) — içerik gelince zıplama olmaz.
 */
export default function NotificationsLoading() {
  return (
    <SkeletonRegion>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-col divide-y divide-sand-100 rounded-card border border-sand-200 bg-card px-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-2.5 py-3">
              <Skeleton className="h-9 w-9 flex-none !rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className={['h-3.5', i % 2 === 0 ? 'w-4/5' : 'w-3/5'].join(' ')} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
