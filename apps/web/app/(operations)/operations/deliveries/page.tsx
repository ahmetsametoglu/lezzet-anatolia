import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { listCourierDay } from '@/lib/courier/day';
import { guarded, requireCourier } from '@/lib/guard';
import { DeliveriesClient } from './deliveries-client';

// **Teslimat & Rota** (`/operations/deliveries`) — rayın SON ölü girişiydi.
//
// ── BUGÜN YALNIZ KURYENİN GÜNÜ ──────────────────────────────────────────────
// Rota aynı adreste iki ekran olacak: kuryenin günü (11.1) ve sevkiyatçının gün planı (09.15). Nav
// zaten tek giriş taşıyor ("Teslimat & Rota", `DAILY` rolü) ve ikisi aynı veriye bakıyor — ayrı
// rotalar açmak, aynı günü iki adresten anlatmak olurdu.
//
// **Sevkiyatçı dalı bugün yok** çünkü kapısı yok: `listByCourier` kurye kimliğini ZORUNLU tutuyor
// (ve kuryenin ekranı için tutmalı — o imza bir güvenlik sınırı), atanmamış teslimatlar okunamıyor.
// Talep açık: `docs/talep/arka-uc-rota-gunu-ve-kurye-atama.md`. Kapı gelince bu dosyaya ikinci bir
// dal eklenir; kuryenin dalı değişmez. BEKLEYEN(09.15)
//
// ── KURYE YALNIZ KENDİ TESLİMATLARINI GÖRÜR ─────────────────────────────────
// Kimlik guard'dan geliyor, adresten DEĞİL: `?courierId=` gibi bir parametre olsaydı bir kurye
// başkasının gününü açabilirdi. Kapının imzası da aynı şeyi yapısal kılıyor.

export default async function DeliveriesPage() {
  const access = await guarded(requireCourier);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Teslimat & Rota"
        reason="Bu ekran kuryenin günü içindir. Günün planını kurmak ve kurye atamak sevkiyat ekranından yapılır — o ekran henüz açılmadı."
      />
    );
  }

  const stops = await listCourierDay({ courierId: access.user.id });

  return <DeliveriesClient stops={stops} />;
}
