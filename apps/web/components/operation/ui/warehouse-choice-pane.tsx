'use client';

import { Badge } from './badge';
import { ErrorState } from './error-state';
import { WarehouseIcon } from './icons';
import { PageHeader } from './page-header';

/**
 * "Önce depo seçin" panesi — depo ekranlarının (hazırlık · stoktan düş) açılış hâli, kapsamı
 * birden çok depoyu kapsayan personelde.
 *
 * ── NEDEN BOŞ LİSTE DEĞİL DE KAPALI EKRAN ────────────────────────────────────
 * `CLAUDE §1`: **varsayılan depo YOKTUR.** Bu ekranlar birer İŞ masasıdır — okudukları şey değil,
 * yazdıkları şey belirleyici: hazırlık kaydı ve stok düşümü hep TEK bir depoya yazılır. "Hepsini
 * göster" bir okuma kolaylığı gibi görünür ama yazma anında karşılığı yoktur; ekranın seçmesi
 * gerekirdi ve seçtiği şey bir varsayılan olurdu.
 *
 * `domain-core/warehouseOptions` aynı kuralı zaten yazıyor: *"kapsamı birden çok olana seçici
 * gösterilir ama varsayılan seçilmez — sistem onun yerine karar vermez."* Bu pane o cümlenin ekran
 * karşılığı.
 *
 * ── BAŞLIK `PageHeader` OLMAK ZORUNDA, ELDE ÇİZİLMİŞ BİR BAR DEĞİL ───────────
 * İlk hâli `NoAccessPane` gibi kendi başlık barını çiziyordu ve **ekranda çözülemez bir hâl
 * üretiyordu** (ölçüldü 08.08, ekran görüntüsüyle): depo seçicisi `PageHeader`'ın içinde yaşıyor
 * (`page-header.tsx:108`), dolayısıyla pane *"üst bardaki seçiciden depo seçin"* diyor ama o
 * seçici sayfada hiç çizilmemiş oluyordu. Kapalı kapı panesinde bu bir sorun değil — orada
 * yapılacak bir şey yok; burada tek çıkış yolu tam olarak o kontrol.
 */
interface WarehouseChoicePaneProps {
  /** Ekranın adı — başlık barında, açık hâliyle aynı yerde durur. */
  title: string;
  /** Bu ekranda depo seçimi neden şart — ekrana özgü tek cümle. */
  reason: string;
  /**
   * Seçilecek depo VAR mı. `false` = kapsamdaki depoların hepsi kapatılmış — operatörü boş bir
   * seçiciye yollamak, çözemeyeceği bir iş vermek olurdu; o hâlde çıkış yolu depo ayarlarıdır.
   */
  hasOptions: boolean;
}

export function WarehouseChoicePane({ title, reason, hasOptions }: WarehouseChoicePaneProps) {
  return (
    <>
      <PageHeader title={title} status={<Badge tone={hasOptions ? 'neutral' : 'amber'}>{hasOptions ? 'depo seçilmedi' : 'açık depo yok'}</Badge>} />
      <ErrorState
        tone={hasOptions ? 'neutral' : 'amber'}
        icon={<WarehouseIcon />}
        title={hasOptions ? 'Önce depo seçin' : 'Açık depo yok'}
        description={`${reason} ${
          hasOptions
            ? 'Başlıktaki depo seçicisinden çalıştığınız depoyu seçin.'
            : 'Depolar ekranından bir depo açılana kadar bu masada iş yapılamaz.'
        }`}
      />
    </>
  );
}
