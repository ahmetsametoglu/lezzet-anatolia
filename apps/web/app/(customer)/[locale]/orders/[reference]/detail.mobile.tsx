'use client';

import { ReorderButton } from '../components/reorder-button';
import { HelpCard, ItemsCard, StatusHero, SummaryCard, TimelineStrip } from './components/detail-sections';
import type { DetailViewProps } from './detail-types';

/**
 * Sipariş detay — mobil (tasarım: "Siparis Detay Mobil · bildirimden gelinen ekran").
 *
 * **Masaüstünün dar hâli DEĞİL, ayrı bir çizim** ve sırası bir iddia taşıyor: bildirimden gelen
 * müşterinin ilk sorusu "siparişim nerede". Bu yüzden en üstte zeytin zeminli **durum kartı**
 * (durum + tarih + "bugün kapınıza geliyor — adres"), sonra **yatay** dört adımlı mini çizgi.
 * Masaüstünde bu bilgi çizgi + teslimat kartına dağılır; orada ikisi aynı anda görünüyor.
 *
 * Teslimat için ayrı kart YOK: adres ve gün zaten durum kartında. Dar ekranda aynı iki satırı
 * ikinci bir kartta tekrarlamak, kaydırma uzunluğunu bilgi eklemeden artırırdı.
 *
 * "↻ Tekrar sipariş" en ALTTA ve tam genişlikte (tasarım): başparmağın doğal yeri orası ve bu
 * ekranın asıl işi bilgi vermek — tekrar sipariş, okuduktan sonra alınan bir karar.
 */
export function DetailMobile({ t, listT, locale, order }: DetailViewProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <StatusHero listT={listT} locale={locale} order={order} />
      <TimelineStrip t={t} order={order} />
      <ItemsCard t={t} locale={locale} order={order} title={t.itemsTitle} />
      <SummaryCard t={t} locale={locale} order={order} title={t.amountTitle} />
      <HelpCard t={t} order={order} />

      <ReorderButton locale={locale} orderId={order.id} label={t.reorder} busyLabel={t.reordering} fullWidth />
    </div>
  );
}
