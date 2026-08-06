import type { PaymentMethod } from '@lezzet/types';
import type { StopOutcome } from '@/lib/courier/day';
import type { OpsTone } from '@/components/operation/ui/tone';
import { money } from '@/components/operation/ui/format';
import type { DoorMethod } from './[orderId]/delivery-types';

// Kurye gün ekranının SÖZLÜĞÜ. Bu yüzeyin kullanıcısı sahada, telefonda, çoğu zaman ayaküstü —
// cümleler kısa ve KAPIDAKİ dille kurulu: "bekliyor" değil sistemin `ready`'si, "ulaşılamadı" değil
// `out_for_delivery → ready` geçişi. İç terim hiç görünmüyor.

/**
 * Durağın hâli — kuryenin gördüğü, sistemin `status`'ü değil.
 *
 * Motorun künyesi ayrımı yazıyor: "ulaşılamadı" ile "henüz sıra gelmedi" **ikisi de `ready`**;
 * fark geçiş geçmişinden türetiliyor. Ekran o türetimi tekrarlamıyor, sonucunu okuyor.
 */
export const OUTCOME_VIEW: Record<StopOutcome, { label: string; tone: OpsTone }> = {
  pending: { label: 'Bekliyor', tone: 'neutral' },
  delivered: { label: 'Teslim edildi', tone: 'olive' },
  // Amber çünkü bu bir BİTİŞ değil, bir askı: mal ayrılmış kalıyor ve kurye gün içinde geri dönebilir.
  unreachable: { label: 'Ulaşılamadı', tone: 'amber' },
  // Kırmızı ama bir suçlama değil: mal depoya döndü, günün planı değişti.
  refused: { label: 'Reddedildi', tone: 'red' },
};

/** Sonuçlanmış mı — ilerleme sayacı ve sıralama bunu soruyor. */
export function isSettled(outcome: StopOutcome): boolean {
  return outcome !== 'pending';
}

export const NOTES = {
  emptyDay:
    'Bugün size atanmış teslimat yok. Plan gün içinde değişebilir — sevkiyat yeni durak eklerse listeyi yenileyince görünür.',
  allDone: 'Günün bütün durakları sonuçlandı. Kasa mutabakatı için gün kapanışına geçebilirsiniz.',
  /** Ulaşılamayanlar listede KALIR — kaybolmaları, geri dönülecek adresi unutturur. */
  retryHint: 'Ulaşılamayan duraklar listede kalır; gün içinde geri dönebilirsiniz.',
  /** Kapıda ödeme yoksa para hiç konuşulmaz (tasarım §2). */
  prepaid: 'Ödendi — kapıda para konuşulmaz',

  // ── Kapıdaki durak (11.2/11.3/11.4) ───────────────────────────────────────
  /** Yola çıkmadan hiçbir sonuç yazılamaz — düğmenin altındaki tek cümlelik sebep. */
  notOnTheWay: 'Bu durak henüz yola çıkmış görünmüyor. Teslim, tahsilat ve "ulaşılamadı" işaretleri yoldaki siparişe yazılır.',
  /**
   * Kanıt yakalama açık değil. Cümle ne olduğunu ve neyin BEKLENDİĞİNİ söylüyor; "yakında" demek
   * söz vermek olurdu, sebebini yazmak ise kuryeye kapıda ne yapacağını söyler.
   */
  proofPending:
    'Bu kanalda imza ya da fotoğraf zorunlu. Kanıt yakalama bu ekranda henüz açık değil — teslim kapatılamaz. Müşteri bekletilmemeli: durağı "ulaşılamadı" işaretleyip depoya bildirin.',
  /** Hesap seçilmemişse tahsilat yazılamaz; teslim yine de kapanabilir, borç açık kalır. */
  noDoorAccount:
    'Kapı tahsilat hesabı seçilmemiş (Ayarlar → Ödeme). Para kaydı yazılamaz; teslim kapatılabilir ama borç açık kalır.',
  /** Nakit yasal eşiği — UYARI, engel değil (DOMAIN §7). */
  cashLimit: (limitCents: number): string =>
    `Nakit yasal uyarı eşiğinin (${money(limitCents)}) üstündesiniz. Tahsilat tamamlanabilir; mümkünse kart ya da çek önerin.`,
  /** Eksik tahsilat sessizce yutulmaz: kalan borç açıkça yazılır. */
  partialCollection: (remainingCents: number): string => `${money(remainingCents)} borç açık kalacak.`,
  /** İki sonucun stok akıbeti — kurye doğru olanı seçebilsin diye pencerenin başlığında yazar. */
  unreachableEffect: 'Mal araçta kalır, sipariş yeniden teslim edilmek üzere bekler.',
  refusedEffect: 'Mal depoya döner; rafa dönüş ya da imha kararı depocunundur.',
} as const;

/**
 * Ödeme yöntemi — kuryenin hazırlığı buna göre (üstü var mı, POS gerekir mi).
 *
 * Anahtarlar `PaymentMethodEnum`'un kendisidir; `Record<PaymentMethod, …>` olması bir yazım tercihi
 * değil bir nöbet: eskiden serbest `Record<string, …>` idi ve iki anahtar şemayla ayrışmıştı
 * (`check`/`transfer` yazılmış, şemada `cheque`/`bank_transfer`) — çek bekleyen kapıda ekran ham
 * `cheque` yazıyordu. Tip artık ayrışmayı derlemede yakalar.
 */
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'nakit',
  card: 'kart',
  cheque: 'çek',
  bank_transfer: 'havale',
  online: 'online',
};

/**
 * Gün kapanışının sözlüğü (11.6). Ayrı bir küme çünkü buranın dili MUTABAKAT dilidir: "beklenen",
 * "sayılan", "fark". İç terim ("mutabakat kaydı", "reconciliation", "para hareketi") görünmez
 * (tasarım §6), ve fark **suçlayıcı olmayan** bir cümleyle yazılır — değerlendirme admin'in işidir.
 */
export const CLOSE_NOTES = {
  /** Sonuçlanmamış durak kapanışı ENGELLEMEZ (tasarım §4): kurye depoya döndüyse günü kapatabilmeli. */
  pending: (count: number): string =>
    `${count} durak sonuçlanmadı. Gün yine de kapatılabilir — bu duraklar yarının işine devrolur.`,
  returned: 'Bu koliler depoya fiziksel teslim edilir; rafa dönüş ya da imha kararı depo tarafında verilir.',
  /** Durağı olmayan gün kapatılmaz — karşılığı olmayan bir mutabakat kaydı "sayıldı" der, oysa sayılan yok. */
  emptyDay: 'Bugün size atanmış teslimat olmadı, dolayısıyla kasaya teslim edilecek bir şey de yok. Gün kapanışı ancak duraklı bir günde anlamlıdır.',
  noCollection: 'Bugün kapıda tahsilat yok — teslimatların tamamı önceden ödenmiş. Sayılacak para yok.',
  reconciled: 'Beklenen ile sayılan tutuyor.',
  /** İşaret ANLAMLI: eksi eksik, artı fazla. Mutlak değere indirmek iki farklı gerçeği aynı gösterirdi. */
  difference: (cents: number): string => (cents < 0 ? `${money(-cents)} eksik` : `${money(cents)} fazla`),
  totalDifference: (cents: number): string =>
    cents < 0 ? `Toplamda ${money(-cents)} eksik.` : `Toplamda ${money(cents)} fazla.`,
  closedAt: (at: string): string => `Gün ${new Date(at).toLocaleString('tr-TR')} tarihinde kapatıldı. Kayıt salt-okunur.`,
} as const;

/**
 * Kapıda SEÇİLEBİLEN yöntemler (11.3) — üçle sınırlı, çünkü online ve havale kuryenin eline hiç
 * girmez. Sıra kapıdaki sıklıktır: nakit önce.
 */
export const DOOR_METHODS: Array<{ key: DoorMethod; label: string }> = [
  { key: 'cash', label: 'Nakit' },
  { key: 'card', label: 'Kart' },
  { key: 'cheque', label: 'Çek' },
];
