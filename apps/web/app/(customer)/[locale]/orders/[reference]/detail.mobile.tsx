'use client';

import { ReorderButton } from '../components/reorder-button';
import { FeedbackInviteCard, HelpCard, ItemsCard, ShipmentCard, StatusHero, SummaryCard, TimelineStrip } from './components/detail-sections';
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
 * **Tek istisna KARGO künyesi** (08.5) ve sebebi tam da yukarıdaki cümle: durum kartı gün+adres
 * taşıyor, taşıyıcı ve takip numarası taşımıyor — yani tekrar değil, EKSİK bilgi. Kart yalnız
 * kargolu ve taşıyıcısı girilmiş siparişte çizilir, rota siparişinde hiç yok. Tasarımın mobil
 * bölümü kargolu hâli çizmemişti; sapma `design/BACKLOG.md`'de.
 *
 * "↻ Tekrar sipariş" en ALTTA ve tam genişlikte (tasarım): başparmağın doğal yeri orası ve bu
 * ekranın asıl işi bilgi vermek — tekrar sipariş, okuduktan sonra alınan bir karar.
 */
export function DetailMobile({ t, listT, locale, order, feedbackInvite }: DetailViewProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <StatusHero listT={listT} locale={locale} order={order} />
      <TimelineStrip t={t} order={order} />
      <ItemsCard t={t} locale={locale} order={order} title={t.itemsTitle} />
      {/* Kalemlerden SONRA, tutardan önce: "nerede" sorusunun cevabı, "ne kadar"dan önce gelir. */}
      <ShipmentCard t={t} order={order} title={t.deliveryTitle} />
      <SummaryCard t={t} locale={locale} order={order} title={t.amountTitle} />
      {/* Teşvik özetin ALTINDA (native ile aynı sıra) — davet, sorun kartından önce gelir. */}
      <FeedbackInviteCard t={t} invite={feedbackInvite} />
      <HelpCard t={t} order={order} />

      <ReorderButton locale={locale} orderId={order.id} fullWidth />
    </div>
  );
}
