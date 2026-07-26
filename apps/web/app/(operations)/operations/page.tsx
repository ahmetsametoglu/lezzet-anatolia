import { Card } from '@/components/operation/ui/card';

// Operasyon ana sayfası (Panel). Guard + kabuk layout'ta; burası içerik. Tam gösterge tablosu
// (KPI bandı, karar kuyruğu) sonraki dilimde — şimdilik kataloğa köprü veren asgari karşılama.
export default function OperationsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-ops-display text-[22px] font-semibold text-ops-ink">Panel</h1>
        <p className="font-ops-body text-[13px] text-ops-muted">
          Operasyonun günlük özeti — sipariş, rota ve para göstergeleri sonraki dilimde.
        </p>
      </div>
      <Card className="p-8">
        <p className="font-ops-body text-sm text-ops-body">
          Katalog yönetimi hazır: sol menüden <span className="font-semibold text-ops-ink">Ürünler</span>&apos;e geçerek
          kataloğu görüntüleyebilirsiniz.
        </p>
      </Card>
    </div>
  );
}
