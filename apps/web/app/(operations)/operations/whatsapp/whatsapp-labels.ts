import type { MessageKind, TemplateCategory } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { WindowView } from './whatsapp-types';

// WhatsApp izleme ekranının SÖZLÜĞÜ ve RENK EŞLEMESİ (15.5).
//
// **Ad haritaları neden burada, enum'un yanında değil:** bugün tek tüketici bu ekran. `Record`'un
// eksik anahtarda derlemeyi durdurma güvencesi nerede dururlarsa dursun geçerli; `packages/types`'ın
// asıl gerekçesi ise "birden çok yüzey aynı adı okusun"dur ve o gerekçe henüz doğmadı. Mesaj türünü
// gösteren ikinci bir yüzey çıktığında (native uygulama izleme ekranı) haritalar enum'un yanına
// taşınır — o gün mekanik bir taşıma olsun diye burada tek parça duruyorlar.

/**
 * Mesaj türü → metinsiz balonun okunacak hâli.
 *
 * `text` haritada YOK denemez — türü metin olan bir mesajın gövdesi boş çıkarsa (adım 2'de
 * sağlayıcıdan gövdesiz bir olay gelebilir) balon boş kalır ve operatör "mesaj kayboldu" sanır.
 * Köşeli parantez ayırıyor: bu bizim yazdığımız bir açıklama, müşterinin cümlesi değil.
 */
export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  text: '[boş mesaj]',
  interactive: '[etkileşimli kart]',
  template: '[kalıp mesaj]',
  media: '[görsel / dosya]',
};

/**
 * Şablon kategorisi = **ücret sınıfı**, süs değil (`message.template_category`). Operatör kalıp
 * mesajın hangi kovadan çıktığını görmeli: pazarlama en pahalısı, utility pencere içinde ücretsiz.
 */
export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  marketing: 'pazarlama',
  utility: 'işlem',
  authentication: 'doğrulama',
};

/** Pencere tonu → ortak renk sözlüğü. Ekranda ham renk seçilmez (CLAUDE.md §3). */
export const WINDOW_TONE: Record<WindowView['tone'], OpsTone> = {
  open: 'olive',
  soon: 'amber',
  closed: 'red',
  idle: 'neutral',
};

/**
 * Altlığın bandı — üç pencere durumunun operatöre söylediği şey.
 *
 * `closed` ile `never` AYRI cümle kurar ve bu ayrım maliyetin kendisidir: biri kaçırılmış bir
 * fırsattır (müşteri yazmıştı, 24 saat doldu), öteki kurulmamış bir ilişkidir (müşteri bize hiç
 * yazmadı — şablon bile ancak izinle gider). Tek cümleye indirilseydi operatör ikisine de aynı
 * çareyi arardı.
 */
export const WINDOW_NOTE: Record<WindowView['state'], string> = {
  // Açık hâlin cümlesi kalan süreyle TAMAMLANIR (çizim: *"Cevap süresi açık · 23 saat kaldı"*),
  // o yüzden burada nokta yok — süreyi ekleyen yer altlığın kendisi.
  open: 'Cevap süresi açık ·',
  closed: 'Cevap süresi doldu — serbest mesaj gönderilemez. Yalnız onaylı kalıp mesaj (ücretli) gider.',
  never: 'Müşteri bize hiç yazmadı — pencere hiç açılmadı. Kalıp mesaj bile ancak pazarlama izniyle gider.',
};

/**
 * Giden balonun künyesi — çizimin sözcüğü ("Siz"). GELEN balona ad YAZILMAZ: kimin yazdığını zaten
 * başlık söylüyor ve her balona ad koymak diziyi gürültüye boğardı (çizim de öyle yapıyor).
 */
export const OUTBOUND_LABEL = 'Siz';

/** AI'ın KENDİ gönderdiği balonun künyesi (16.08) — çizimin sözcüğü ("AI ajanı"), mor tonla okunur. */
export const AI_OUTBOUND_LABEL = 'AI ajanı';
