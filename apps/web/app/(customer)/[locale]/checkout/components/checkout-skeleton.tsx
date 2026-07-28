import { Skeleton, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import type { Messages } from '../checkout-types';

/**
 * Checkout adımlarının ilk karesi.
 *
 * Sayfa açıldığında adres listesi, teslimat günleri ve ödeme seçenekleri henüz YOK: üçü de seçili
 * adresin cevabı ve istemcide çözülüyor. O aralıkta ekran iki yanlıştan birini yapıyordu —
 * adımlar hiç çizilmiyor (sayfa yarım görünüyor) ya da adres adımı **"Henüz kayıtlı adresiniz yok"**
 * diyordu. İkincisi daha kötü: veri gelmeden verilmiş bir hüküm, üstelik yanlış olabilen bir hüküm.
 *
 * İskelet üçüncü ve doğru cevabı verir — *birazdan burada bir şey olacak* — ve gerçek adımlarla
 * aynı kabuğu (`SkeletonCard`) kullandığı için içerik gelince kutu yerinden oynamaz.
 *
 * Adım numaraları GERÇEK: `1 · 2 · 3` yükleme sırasında da doğrudur ve müşteri kaç adım kaldığını
 * ilk kareden itibaren görür (tasarım: "az adım, tam görünürlük").
 */
export function CheckoutStepsSkeleton({ t, compact = false }: { t: Messages; compact?: boolean }) {
  const steps = [
    { step: t.address.step, title: t.address.title, rows: 2 },
    { step: t.delivery.step, title: t.delivery.title, rows: 1 },
    { step: t.payment.step, title: t.payment.title, rows: 3 },
  ];

  return (
    <SkeletonRegion label={t.title}>
      <div className="flex flex-col gap-4">
        {steps.map(({ step, title, rows }) => (
          <SkeletonCard key={step} compact={compact}>
            {/* Başlık satırı iskelet DEĞİL: numara ve ad zaten elimizde, onları da gri çubuğa
                çevirmek bildiğimiz bir şeyi saklamak olurdu. */}
            <div className="flex items-center gap-3">
              <span className="flex size-[30px] flex-none items-center justify-center rounded-full bg-sand-200 font-sans text-body font-bold text-muted">
                {step}
              </span>
              <span className="font-serif text-card-title-sm text-muted">{title}</span>
            </div>
            <div className={compact ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2.5'}>
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-soft border-[1.5px] border-sand-200 px-[18px] py-3.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <SkeletonText lines={2} />
                </div>
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>
    </SkeletonRegion>
  );
}
