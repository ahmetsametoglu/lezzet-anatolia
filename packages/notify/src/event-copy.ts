import type { PreferredLanguage } from '@lezzet/types';
import type { NotifyEventName, NotifyPayloads } from './types';

/*
  ── OLAYIN TEK CÜMLELİK ÖZETİ — İKİ SÜRÜCÜNÜN ORTAK SÖZLÜĞÜ (14.16) ────────────────────────────
  Kaynağı `wa-link.driver.ts`ti; push sürücüsü doğduğunda buraya TERFİ etti (CLAUDE §1): wa.me
  metni ile push gövdesi aynı cümledir — iki kopya olsaydı biri gün gelip "yola çıktı"yı öteki
  "hazırlanıyor" derken söylerdi. Mail bu sözlüğü KULLANMAZ: mailin işi özet değil, belgenin
  kendisi (şablonlar `packages/email`de).
*/

/**
 * Mesaj metinleri müşterinin dilinde (DOMAIN §10) — mail tarafıyla aynı kural. Operatör bu metni
 * kendi eliyle yollasa da alıcı müşteridir; gönderenin dili değil, okuyanın dili geçerlidir.
 */
function say(locale: PreferredLanguage, phrases: Record<PreferredLanguage, string>): string {
  return phrases[locale];
}

/**
 * **Talep mesajları konuyu TAŞIMAZ.** Sipariş referansı zaten müşterinin elindeki bir numaradır,
 * ama talep başlığı şikâyetin kendisidir ("bozuk et geldi") ve WhatsApp önizlemesi kilit ekranında
 * görünür. Bağlantı yeterli: ayrıntı talebin kendi sayfasında durur.
 */
export const MESSAGE: { [E in NotifyEventName]: (data: NotifyPayloads[E]) => string } = {
  order_confirmed: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişiniz alındı.`,
      fr: `Votre commande ${d.referenceNo} a bien été reçue.`,
      de: `Ihre Bestellung ${d.referenceNo} ist eingegangen.`,
    }),
  order_out_for_delivery: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişiniz yola çıktı.`,
      fr: `Votre commande ${d.referenceNo} est en route.`,
      de: `Ihre Bestellung ${d.referenceNo} ist unterwegs.`,
    }),
  order_delivered: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişiniz teslim edildi. Afiyet olsun!`,
      fr: `Votre commande ${d.referenceNo} a été livrée. Bon appétit !`,
      de: `Ihre Bestellung ${d.referenceNo} wurde zugestellt. Guten Appetit!`,
    }),
  order_cancelled: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişiniz iptal edildi.`,
      fr: `Votre commande ${d.referenceNo} a été annulée.`,
      de: `Ihre Bestellung ${d.referenceNo} wurde storniert.`,
    }),
  order_shortfall: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişinizde bir kalem eksik gönderildi.`,
      fr: `Un article de votre commande ${d.referenceNo} a été livré en quantité incomplète.`,
      de: `Ein Artikel Ihrer Bestellung ${d.referenceNo} wurde unvollständig geliefert.`,
    }),
  order_refunded: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişinizin iadesi işlendi.`,
      fr: `Le remboursement de votre commande ${d.referenceNo} a été traité.`,
      de: `Die Erstattung Ihrer Bestellung ${d.referenceNo} wurde bearbeitet.`,
    }),
  ticket_received: (d) =>
    say(d.locale, {
      tr: `Talebinizi aldık, en kısa sürede döneceğiz: ${d.ticketUrl}`,
      fr: `Nous avons bien reçu votre demande, nous revenons vers vous rapidement : ${d.ticketUrl}`,
      de: `Wir haben Ihre Anfrage erhalten und melden uns in Kürze: ${d.ticketUrl}`,
    }),
  ticket_replied: (d) =>
    say(d.locale, {
      tr: `Talebinize cevap verdik: ${d.ticketUrl}`,
      fr: `Nous avons répondu à votre demande : ${d.ticketUrl}`,
      de: `Wir haben auf Ihre Anfrage geantwortet: ${d.ticketUrl}`,
    }),
  ticket_status_changed: (d) =>
    d.status === 'resolved'
      ? say(d.locale, {
          tr: `Talebiniz çözüldü. Sorun sürerse yazmanız yeterli: ${d.ticketUrl}`,
          fr: `Votre demande est résolue. Si le problème persiste, écrivez-nous : ${d.ticketUrl}`,
          de: `Ihre Anfrage ist gelöst. Besteht das Problem weiterhin, schreiben Sie uns: ${d.ticketUrl}`,
        })
      : say(d.locale, {
          tr: `Talebiniz yeniden açıldı: ${d.ticketUrl}`,
          fr: `Votre demande a été rouverte : ${d.ticketUrl}`,
          de: `Ihre Anfrage wurde wieder geöffnet: ${d.ticketUrl}`,
        }),
  // Davet mesajı KISA: WhatsApp'ta uzun metin okunmaz, tıklanır. Ürün sayısı yok — kaç ürün
  // olduğu bağlantının ardındaki ekranın işi; mesajın işi tek soruyu sormak.
  feedback_invite: (d) =>
    say(d.locale, {
      tr: `${d.orderReferenceNo} numaralı siparişinizdekiler nasıldı? Birkaç saniyenizi alır: ${d.feedbackUrl}`,
      fr: `Comment étaient les produits de votre commande ${d.orderReferenceNo} ? Cela prend quelques secondes : ${d.feedbackUrl}`,
      de: `Wie waren die Produkte Ihrer Bestellung ${d.orderReferenceNo}? Es dauert nur Sekunden: ${d.feedbackUrl}`,
    }),
  // Bölge haberi tek cümle: kod + "artık geliyoruz" + bağlantı. Katalogda ne olduğu, hangi gün
  // gidildiği, kaydın kapandığı — hepsi mailin işi; WhatsApp'ın işi haberi vermek.
  zone_available: (d) =>
    say(d.locale, {
      tr: `${d.postalCode} artık teslimat bölgemizde. Katalog: ${d.catalogUrl}`,
      fr: `Nous livrons désormais le ${d.postalCode}. Catalogue : ${d.catalogUrl}`,
      de: `Wir liefern jetzt nach ${d.postalCode}. Katalog: ${d.catalogUrl}`,
    }),
  /**
   * Başvuru sonucu.
   *
   * **RET GEREKÇESİ WhatsApp'a YAZILMIYOR ve bu bilinçli:** gerekçe operatörün serbest metnidir,
   * uzunluğu belirsizdir ve bağlantı öncesinde kesilirse müşteri yarım bir cümle okur. Mesaj
   * "bir eksik var" der ve hesaba yönlendirir; gerekçenin tam hâli mailde ve ekranda durur.
   */
  b2b_application_result: (d) =>
    d.approved
      ? say(d.locale, {
          tr: `Toptan hesabınız açıldı. Toptan fiyatlar: ${d.actionUrl}`,
          fr: `Votre compte professionnel est ouvert. Tarifs pros : ${d.actionUrl}`,
          de: `Ihr Geschäftskonto ist freigeschaltet. Großhandelspreise: ${d.actionUrl}`,
        })
      : say(d.locale, {
          tr: `Toptan başvurunuzda bir eksik var; ayrıntı hesabınızda: ${d.actionUrl}`,
          fr: `Il manque un élément à votre demande professionnelle ; détails dans votre compte : ${d.actionUrl}`,
          de: `In Ihrem Geschäftskundenantrag fehlt etwas; Details in Ihrem Konto: ${d.actionUrl}`,
        }),
};
