import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { buttonClass } from '@/components/operation/ui/button';
import { SkeletonFilterBar, SkeletonMetric, SkeletonRows } from '@/components/operation/ui/skeleton';

// Para ekranının yükleme hâli (09.2'nin iskelet kuralı): iskelet GERÇEK ekranın iskeletidir —
// bakiye şeridi, süzgeç barı, iki sütunlu gövde. Tek bir dönen çark, sayfanın neye benzeyeceğini
// söylemez ve gelince ekran zıplar.
//
// ── STATİK KİMLİK GERÇEK (15.08, emsal: fiyatlar) ───────────────────────────
// Bu ekranın başlık bandında VERİ YOK: başlık, alt başlık ve iki eylem metni de statik — hepsi
// gerçek çizilir, tek çubuk kalmaz. Eylemler tıklanmaz süs (`buttonClass`lı span): davranışları
// sayfayla gelir, görünümleri sayfadan önce de doğru. Eski hâl `SkeletonPageHeader
// actions={['+ Hareket', …]}` yazmıştı — o parametre GENİŞLİK SINIFI bekler, metinler geçersiz
// class olarak yutuluyor ve çubuklar sıfır genişlikte hiç görünmüyordu (raporlarla aynı arıza).
//
// **Kolon başlıkları gerçek metin**, çubuk değil: statik oldukları için bekleyen bir şey yok, çubuk
// yapmak bilgi saklamak olurdu.

export default function FinanceLoading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Para yükleniyor">
      <PageHeader title="Para" subtitle="İşletme para takibi · resmî muhasebe değil">
        <span className={buttonClass({ variant: 'secondary', size: 'sm' })}>+ Hareket</span>
        <span className={buttonClass({ variant: 'secondary', size: 'sm' })}>⇄ Transfer</span>
      </PageHeader>

      <div className="flex items-stretch gap-6 border-b border-ops-line-soft bg-ops-surface-sunken px-6 py-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex-1">
            <SkeletonMetric boxed={false} />
          </div>
        ))}
      </div>

      {/* Hesap sayısı bilinmiyor — dört çip makul bir tahmin (kasa + iki banka + Stripe). */}
      <SkeletonFilterBar count={4} />

      <div className="grid min-h-0 flex-1 grid-cols-[1.65fr_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <div className="grid grid-cols-[62px_minmax(0,1fr)_100px_120px_14px] items-center gap-x-3 border-b border-ops-line px-6 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-faint">
            <span>Tarih</span>
            <span>Açıklama</span>
            <span className="text-right">Tutar</span>
            <span>Hesap · tür</span>
            <span />
          </div>
          <SkeletonRows rows={10} />
        </div>

        {/* Sağ panel iskelet DEĞİL, başlığıyla duruyor: ilk açılışta hesap seçili olmadığı için
            panelin gerçek hâli de bu — iskelet "birazdan burada kuyruk olacak" sözü verirdi. */}
        <div className="flex min-h-0 flex-col bg-ops-surface-sunken">
          <div className="flex flex-col gap-0.5 border-b border-ops-line px-5 py-3">
            <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Banka satırı eşleştirme</span>
            <span className="font-ops-body text-ops-xs text-ops-faint">sistem önerir, siz onaylarsınız</span>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
