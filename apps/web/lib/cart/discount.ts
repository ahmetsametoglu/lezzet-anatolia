import 'server-only';

/**
 * **Geçiş köprüsü** — sepet indirim çözümünün gövdesi `@lezzet/application/cart/discount`ta
 * (terfi aşama 2/3, 10.08 · denetim K5-1). Künyenin tamamı orada: tek-en-büyük kuralının neden
 * motorda kaldığı, kupon reddedilse bile kazananın neden taşındığı, matrah muafiyetlerinin neden
 * burada tekrarlandığı.
 *
 * **Neden köprüye indi.** Terfi 08.08'de yapılmış ama web kopyası yerinde bırakılmıştı: iki dosya
 * arasındaki fark 5 satırdı (`server-only` importu + terfi künyesi) ve İKİSİ DE canlıydı — web
 * sepeti buradan, mobil arka uç paketten okuyordu. Aynı soruya iki cevap veren bir kural, bir gün
 * ayrışan bir kuraldır ve **hiçbir test bunu yakalamaz**: iki dosyanın da kendi testi vardı, ikisi
 * de yeşildi. Belirti ancak son kullanıcıda çıkardı — "web'de kupon geçti, uygulamada geçmedi".
 *
 * `server-only` BURADA kalıyor, pakette değil: paket taşıma bilmez (Next'e ait hiçbir şey pakete
 * girmez), ama web tarafında bu kapının istemciye sızmaması hâlâ zorlanmalı.
 *
 * Testi de pakete bırakıldı (`packages/application/src/cart/discount.test.ts`, 18 test) — köprüyü
 * test eden bir test, kuralı test etmiş sayılmaz.
 */
export { resolveCartDiscount } from '@lezzet/application';
