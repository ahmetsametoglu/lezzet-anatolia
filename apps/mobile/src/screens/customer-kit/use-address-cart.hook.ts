import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { MeCartView } from '@lezzet/types';

import { fetchCart } from '@/lib/api/cart';

/*
  CHECKOUT'UN SEPETİ ADRESLE ÇÖZÜLÜR — GEZİNME KODUYLA DEĞİL.

  Uygulama boyunca sepet görünümü ONBOARDING posta koduyla çözülüyor (`useCartSync`) ve bu doğru:
  müşteri vitrini o kodla geziyor, sepette de o kodun cevabını görüyor. Ama sipariş o koda değil
  SEÇİLEN ADRESE açılıyor ve ikisi pekâlâ farklı olabilir — müşteri 67000'i yazıp gezinir, sipariş
  adresi 67380'dir.

  ── NEDEN ÖNCEKİ ÇARE YETMEDİ (ölçüldü 10.08, cihazda) ──────────────────────
  Ekran farkı biliyordu ve iki koşullu bir süzgeç yazmıştı: "adres soğuk zinciri engelliyorsa
  (`delivery.blocked`) VE satırın grubu `undeliverable` ise düş". İkinci koşul gezinme koduyla
  çözülmüş görünümden okunuyordu, yani kod rota İÇİ olduğu an hiçbir satır `undeliverable` olmuyor
  ve süzgeç hiçbir şey düşürmüyordu. Ölçüm: sepet 67000 ile kurulup adres 67380 seçilince özet DÖRT
  kalemi de yazıyor (76,95 €) — üstelik ekranın kendi uyarısı aynı anda "bu kalemler siparişe
  eklenmiyor" diyor. Ekran kendi kendini yalanlıyordu.

  ── ÇÖZÜM İKİNCİ BİR HESAP DEĞİL, DOĞRU YERLE İKİNCİ BİR OKUMA ──────────────
  Kuralı yine SUNUCU uyguluyor (`getCartView`); değişen tek şey ona hangi yerin sorulduğu. Bu bir
  duplikasyon değil: ikinci bir gruplama/aritmetik yazılmıyor, aynı kapı adresin posta koduyla bir
  kez daha çalınıyor. İstemci grubu kendi türetseydi (CLAUDE §1'in yasakladığı şey) sepet ile
  checkout bir gün ayrışırdı — burada ikisi de aynı kapının cevabı, yalnız farklı yer için.

  ── İKİ ÇAĞIRAN, TEK KURAL (kullanıcı kararı 10.08) ─────────────────────────
  Hem sepet hem checkout bunu kullanıyor ve gerekçesi çekmecenin KENDİ cümlesi: *"Bu kod yalnız
  vitrini gezmek içindir; siparişte kayıtlı adresiniz kullanılır."* Sözü sepet de tutmalı — satın
  alma tarafının tamamı ADRESLE çözülür, gezinme kodu vitrinde kalır. İki ekran aynı kaynağı
  okuyunca "sepette gördüğüm, checkout'ta başka çıktı" arızası yapısal olarak imkânsızlaşır;
  uyarıyla yönetilmesi gereken bir fark kalmaz.

  Depoya YAZILMAZ ve depo bundan HABERSİZDİR: deponun görünümü gezinme kodunundur ve yüzen sepet
  sayacı ile vitrin onu okumaya devam eder.
*/

/**
 * Seçilen adresin posta koduyla çözülmüş sepet görünümü; henüz bilinmiyorsa `null` (çağıran o hâlde
 * gezinme görünümüne düşer — ekranı boş bırakmaktansa bir adım eski bir doğru göstermek yeğdir).
 *
 * `postalCode` `null` iken ağa ÇIKILMAZ: adres seçilmeden sorulacak bir yer yok.
 */
export function useAddressCartView(locale: Locale, postalCode: string | null, coupon: string | null): MeCartView | null {
  const [view, setView] = useState<MeCartView | null>(null);
  /** Kaçıncı okumanın geçerli olduğu — adres hızla değiştirilirse eski cevap yenisini ezmesin. */
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    if (postalCode === null) {
      setView(null);
      return;
    }
    const result = await fetchCart({ locale, postalCode, coupon });
    if (run !== generation.current) return;
    // Ret hâlinde ESKİ görünüm korunur: okunamayan bir cevabı `null`a çevirmek, ekranı sessizce
    // gezinme koduna geri düşürürdü ve müşteri sebebini göremezdi.
    if (result.error === null) setView(result.data);
  }, [coupon, locale, postalCode]);

  useEffect(() => {
    void load();
  }, [load]);

  return view;
}
