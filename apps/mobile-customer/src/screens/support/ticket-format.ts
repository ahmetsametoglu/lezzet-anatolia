import type { Locale } from '@lezzet/i18n';
import type { TicketStatus } from '@lezzet/types';

import { formatOrderDate } from '@/screens/orders/order-format';

/*
  TALEP EKRANLARININ METİN TÜRETMELERİ — liste kartı ile detay başlığı AYNI kurallara bakar.
  Ayrı ayrı yazılsalardı kart "Eksik ürün · Gözleme" derken başlık başka bir şey diyebilirdi
  (web'in `support/components/ticket-labels.ts` dosyasındaki aynı gerekçe; iki yüzey aynı müşteriye
  aynı cümleyi göstermeli).

  TARİH BİÇİMİ SİPARİŞLERDEN GELİR (`formatOrderDate`, yıllı kısa ay): talep listesi de bir
  ARŞİVDİR ve yıllara yayılır — ikinci bir tarih dili yazmak, bir gün ayrışacak iki biçim demekti.
  O dosyanın kendi künyesi `@lezzet/helper`a terfi borcunu zaten kaydediyor; terfi gününde bu
  dosyanın importu tek satırda döner.
*/

/**
 * Talebin ekrandaki adı: **tür · konu**.
 *
 * `subject` boş olabilir ve bu NORMALDİR (sözleşme künyesi: müşteri başlık yazmaz, anlatımını
 * yazar) — başlığı olan talep personelin elle açtığıdır. Boşken geriye türün kendisi kalır;
 * "Soru ·" gibi asılı bir ayraç bırakılmaz.
 */
export function ticketTitle(typeLabel: string, subject: string | null, template: string): string {
  const trimmed = subject?.trim();
  return trimmed ? template.replace('{type}', typeLabel).replace('{subject}', trimmed) : typeLabel;
}

/** Kartın bağlamı: siparişin numarası ya da "Genel". */
export function ticketScope(orderReference: string | null, orderTemplate: string, generalLabel: string): string {
  return orderReference === null ? generalLabel : orderTemplate.replace('{reference}', orderReference);
}

/**
 * Alt satırın parçaları: `{kapsam} · {açılış} · son mesaj: {ne zaman}`.
 *
 * **"Son mesaj" çözülmüş talepte YAZILMAZ** (web müşteri kartının kararı): kapanmış bir talebin son
 * mesajı bir davet değil, bir kayıttır — orada anlamlı olan açılış tarihidir.
 *
 * ŞABLONDAN SAPMA (v3 yalnız `kapsam · tarih` yazıyor): liste SON MESAJA göre sıralı (ucun kararı —
 * cevaplanan talep başa çıkar) ve sıralama ölçütünü göstermeyen bir liste müşteriye rastgele
 * sıralı görünürdü.
 */
export function ticketMeta(
  ticket: { status: TicketStatus; createdAt: string; lastMessageAt: string },
  scope: string,
  lastMessageTemplate: string,
  locale: Locale,
): string {
  const parts = [scope, formatOrderDate(ticket.createdAt, locale)];
  if (ticket.status !== 'resolved') {
    parts.push(lastMessageTemplate.replace('{date}', formatOrderDate(ticket.lastMessageAt, locale)));
  }
  return parts.join(' · ');
}
