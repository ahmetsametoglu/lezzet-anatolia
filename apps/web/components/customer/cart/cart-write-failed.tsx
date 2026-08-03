'use client';

import type { Locale } from '@lezzet/i18n';
import { CartStrip } from './cart-strip';
import messages from './cart-messages.json';

/**
 * Yazma düşünce çıkan şerit (akış denetimi #12 · 03.08).
 *
 * Kapatılan boşluk: sepet OKUMAYI düşerse `failed` bayrağı kalkıp ekran arıza gösteriyordu, ama
 * YAZMA düşerse hiçbir şey olmuyordu — iyimser adet ekranda kalıyor, sunucuda o satır yok.
 * Müşteri "3 kg" görüp checkout'a gidiyor ve orada 2 kg buluyordu. **Ölçülemeyen değer sıfır
 * değildir** kuralının sepetteki hâli: yazılamayan adet, yazılmış gibi gösterilemez.
 *
 * Şerit yalnız GİRİŞLİ müşteride çıkar. Ziyaretçide sepet tarayıcıda yaşar ve niyet oraya zaten
 * yazılmıştır; sunucudan istenen tek şey fiyatın çözülmesidir. Orada "kaydedilemedi" demek,
 * gerçekte kaybolmamış bir şeyi kayıp ilan etmek olurdu.
 *
 * Eylem "tekrar dene" ve yaptığı şey sepeti yeniden OKUMAK: yazma düştüyse ekranın gösterdiği ile
 * sunucudakinin ayrıştığı kesindir, doğrusunu ancak sunucu söyler.
 */
interface CartWriteFailedProps {
  locale: Locale;
  open: boolean;
  onRetry: () => void;
  onClose: () => void;
}

export function CartWriteFailed({ locale, open, onRetry, onClose }: CartWriteFailedProps) {
  const t = messages[locale];
  if (!open) return null;

  return (
    <CartStrip
      message={t.writeFailed}
      action={{ label: t.retry, onClick: onRetry }}
      onClose={onClose}
      dismissLabel={t.dismiss}
      live="assertive"
    />
  );
}
