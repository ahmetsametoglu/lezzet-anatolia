import type { ConversationSource, MessageKind, TemplateCategory } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { WindowView } from './social-types';

// Sosyal gelen kutusunun SÖZLÜĞÜ ve RENK EŞLEMESİ (15.5 · üç kanal 15.15).
//
// **Ad haritaları neden burada, enum'un yanında değil:** bugün tek tüketici bu ekran. `Record`'un
// eksik anahtarda derlemeyi durdurma güvencesi nerede dururlarsa dursun geçerli; `packages/types`'ın
// asıl gerekçesi ise "birden çok yüzey aynı adı okusun"dur ve o gerekçe henüz doğmadı. Mesaj türünü
// gösteren ikinci bir yüzey çıktığında (native uygulama izleme ekranı) haritalar enum'un yanına
// taşınır — o gün mekanik bir taşıma olsun diye burada tek parça duruyorlar.

/** Kanal adı — rozet ve süzgeç çipinin metni. Marka adları çevrilmez. */
export const SOURCE_LABELS: Record<ConversationSource, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
};

/**
 * Kuyruk satırının seçili kenarı — kanal MARKA rengiyle: kuyruk artık üç kanalın kuyruğu ve satırın
 * hangi kanaldan geldiği ilk bakışta okunmalı. Renkler token'dan (CLAUDE §3), ham hex yok.
 */
export const SOURCE_EDGE: Record<ConversationSource, string> = {
  whatsapp: 'border-l-brand-whatsapp',
  messenger: 'border-l-brand-messenger',
  instagram: 'border-l-brand-instagram',
};

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
 * (Şablon yalnız WhatsApp'ta var — kural veride, `record_message`.)
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
 * Altlığın bandı — pencere durumunun operatöre söylediği şey, KANAL BAŞINA (15.15).
 *
 * Cümleler kanala göre ayrışmak ZORUNDA, süs değil: "kapalı" WhatsApp'ta bir ÜCRET kararıdır
 * (yalnız ücretli kalıp mesaj gider), Messenger/Instagram'da ise bir KURAL sınırıdır (ücret yok;
 * cevap 7 güne kadar yalnız insan-temsilci istisnasıyla gidebilir). WhatsApp cümlesini üç kanala
 * yaymak, operatörü Messenger'da olmayan bir ücretten korkutur ya da olmayan bir serbestliğe
 * güvendirirdi.
 *
 * `closed` ile `never` her kanalda AYRI cümle kurar: biri kaçırılmış bir fırsattır (müşteri
 * yazmıştı, süre doldu), öteki kurulmamış bir ilişkidir (müşteri hiç yazmadı) — Messenger/IG'de
 * üstelik işletme SOHBET BAŞLATAMAZ, ilk sözü daima müşteri söyler.
 */
export const WINDOW_NOTE: Record<ConversationSource, Record<WindowView['state'], string>> = {
  whatsapp: {
    // Açık hâlin cümlesi kalan süreyle TAMAMLANIR (çizim: *"Cevap süresi açık · 23 saat kaldı"*),
    // o yüzden burada nokta yok — süreyi ekleyen yer altlığın kendisi.
    open: 'Cevap süresi açık ·',
    closed: 'Cevap süresi doldu — serbest mesaj gönderilemez. Yalnız onaylı kalıp mesaj (ücretli) gider.',
    never: 'Müşteri bize hiç yazmadı — pencere hiç açılmadı. Kalıp mesaj bile ancak pazarlama izniyle gider.',
  },
  messenger: {
    open: 'Cevap süresi açık ·',
    closed:
      'Standart 24 saatlik süre doldu — cevap 7 güne kadar yalnız insan-temsilci kuralıyla gidebilir (ücret yok).',
    never: 'Müşteri henüz yazmadı — Messenger sohbetini her zaman müşteri başlatır.',
  },
  instagram: {
    open: 'Cevap süresi açık ·',
    closed:
      'Standart 24 saatlik süre doldu — cevap 7 güne kadar yalnız insan-temsilci kuralıyla gidebilir (ücret yok).',
    never: 'Müşteri henüz yazmadı — Instagram sohbetini her zaman müşteri başlatır.',
  },
};

/**
 * Giden balonun künyesi — çizimin sözcüğü ("Siz"). GELEN balona ad YAZILMAZ: kimin yazdığını zaten
 * başlık söylüyor ve her balona ad koymak diziyi gürültüye boğardı (çizim de öyle yapıyor).
 */
export const OUTBOUND_LABEL = 'Siz';

/** AI'ın KENDİ gönderdiği balonun künyesi (16.08) — çizimin sözcüğü ("AI ajanı"), mor tonla okunur. */
export const AI_OUTBOUND_LABEL = 'AI ajanı';

/*
  `AI_MODE_UNAVAILABLE` KALDIRILDI (29.08) — mod açıldı, ipucunun anlattığı kısıt kalmadı.
  Cümle *"mesajı gönderecek kanal açılmadı"* diyordu ve 28.08'de o kanal açıldı (15.11); kapalı bir
  düğmenin yanında duran eskimiş bir açıklama, düğmenin kendisinden daha yanıltıcıdır. Gerekçenin
  tarihsel hâli `ConversationHandlerEnum` künyesinde duruyor.
*/
