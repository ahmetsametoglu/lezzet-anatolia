import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DiscountInsertSchema,
  DiscountSchema,
  DiscountUpdateSchema,
  type Discount,
  type DiscountInsert,
  type DiscountUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { DiscountCodeService } from './discount-code.service';

/**
 * İndirim tanımı CRUD + kullanım sayımları (05.6).
 *
 * **Bu servis KARAR VERMEZ, satır getirir/yazar** (STACK §4). "Bu sepete hangi indirim, ne kadar"
 * kararı saf motordadır (`domain-core/pricing.applyBestDiscount`); tek-en-büyük kuralı, matrah
 * muafiyetleri ve pay dağıtımı orada yaşar. Servis kuralın kendisini saklar ve motorun
 * karşılaştıracağı SAYILARI (kullanım adetleri) getirir.
 *
 * Liste SAYFALANMAZ: indirim kümesi veriyle değil **operatörün eliyle** büyür ve doğal tavanı vardır
 * (CLAUDE.md §1). Kişisel kuponlar bu tavanı zorlarsa (puan kullanımı toplu kupon üretirse) liste
 * keyset'e döner ve ekrana müşteri süzgeci gerekir.
 */
export class DiscountService extends BaseDbService<Discount, DiscountInsert, DiscountUpdate> {
  /** Kolonlar `discount.amount` ve `discount.min_basket` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents', 'minBasketCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'discount', DiscountSchema, DiscountInsertSchema, DiscountUpdateSchema);
  }

  /** Yönetim listesi — en yeni önce. Pasifler de gelir: süresi dolmuş kupon GEÇMİŞTİR, silinmez. */
  async list(): Promise<Discount[]> {
    return this.getAll(undefined, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Sepet çözümünün adayları: AKTİF kurallar. Süzme burada dar tutulur (tarih/koşul motorun işi) —
   * "geçerli mi" sorusunun ölçütü SQL'e kopyalanırsa eşik iki yerde yaşar.
   *
   * Kişisel kuponlar yalnız sahibine gelir: `customerId` verilmezse herkese açık olanlar okunur.
   */
  async listCandidates(customerId?: string | null): Promise<Discount[]> {
    const rows = await this.getAll({ isActive: true }, { orderBy: 'createdAt', orderDirection: 'desc' });
    return rows.filter((r) => r.customerId === null || (customerId != null && r.customerId === customerId));
  }

  /**
   * Koda göre kupon — kod artık kuralın kolonu değil, `discount_code` satırıdır (bir kuponun birden
   * çok kapısı olur). Arama `DiscountCodeService`'te; burada yalnız kapının açtığı kural getirilir.
   *
   * Dönen değer kuralı **ve hangi kodun tuttuğunu** taşır: kullanım kaydı o kimliği yazar, "TR kodu
   * mu FR kodu mu tuttu" sorusu ancak böyle yanıtlanır.
   */
  async findByCode(code: string): Promise<{ discount: Discount; codeId: string; code: string } | null> {
    const match = await new DiscountCodeService(this.supabase).findByCode(code);
    if (!match) return null;
    const discount = await this.getById(match.discountId);
    return discount ? { discount, codeId: match.id, code: match.code } : null;
  }

  /**
   * Bir müşteriye ÖZEL kupon kuralları (09.9) — puan çevriminden doğanlar dahil.
   *
   * `listCandidates`'ten farkı kapsam: o "bu müşteriye uygulanabilir olanlar"ı verir (herkese açık
   * kampanyalar dahil), bu yalnız SAHİBİ o müşteri olanları. Müşteri kartında herkese açık bir
   * kampanyayı "bu kişinin kuponu" gibi göstermek yanlış olurdu.
   *
   * ── PENCERE DOĞRU KÜMEYE VURUYOR (08.5 kapandı · müşteri şeridinin talebi 09.08) ────────────
   * Eskiden tavan "en yeni 50 KUPON"a vuruyordu, "en yeni 50 KULLANILABİLİR kupon"a değil: pasif,
   * tarih penceresi dışı ve kotası dolmuş kuponlar 50 satır çekildikten SONRA uygulamada eleniyordu.
   * Kupon kümesi puan çevrimiyle büyür ve **kullanılmış kuponlar kümede kalır** (silinmiyorlar,
   * kapatılıyorlar — `setActive` künyesi). Yani birkaç yıl sonra pencere kullanılmışlarla dolar ve
   * ekranda kullanılabilir kupon **sessizce eksik** görünürdü: eksik kupon "yok" gibi okunur, hata
   * vermez.
   *
   * **Keyset DEĞİL, süzgeci sorguya taşımak.** `CLAUDE §1`'in ölçütü "sınırsız büyümek": sınırsız
   * büyüyen şey tüm kupon GEÇMİŞİdir; bir müşterinin aynı anda elinde tuttuğu kullanılabilir kupon
   * doğal tavanı olan bir kümedir. Doğru düzeltme sonsuz kaydırma değil, pencerenin doğru kümeye
   * vurması — ekran tarafında "daha fazla göster" diye bir tasarım da yok (hesap sayfasında sabit
   * blok).
   *
   * **Kota elemesi UYGULAMADA kaldı** ve bu bilinçli: `usageCounts` iptal/iade kuralını taşıyan ayrı
   * bir turdur (`discount_use` kayıtlarından türer, sayaç kolonundan değil). Aynı kuralı SQL'e
   * ikinci kez yazmak, bir gün ayrışan iki cevap üretirdi.
   *
   * `usableAt` verilmezse davranış AYNEN eskisi gibi — başka bir çağıran doğarsa kırılmaz.
   */
  listByCustomer(customerId: string, opts: { usableAt?: Date; limit?: number } = {}): Promise<Discount[]> {
    const limit = opts.limit ?? 50;
    if (!opts.usableAt) return this.getAll({ customerId }, { orderBy: 'createdAt', orderDirection: 'desc', limit });

    const at = opts.usableAt.toISOString();
    return this.getAll(
      { customerId, isActive: true },
      {
        // İki AYRI grup, yani aralarında VE var: "başlamış" VE "bitmemiş". Tek grupta yazılsaydı
        // araya VEYA girerdi ve süresi geçmiş kupon "başlamış" olduğu için geçerdi.
        orFilters: [`valid_from.is.null,valid_from.lte.${at}`, `valid_to.is.null,valid_to.gte.${at}`],
        orderBy: 'createdAt',
        orderDirection: 'desc',
        limit,
      },
    );
  }

  /** Aktiflik anahtarı — süresi dolmuş/kullanımı bitmiş kupon SİLİNMEZ, kapatılır (geçmişi kalsın). */
  setActive(id: string, isActive: boolean): Promise<Discount> {
    return this.update({ id, isActive });
  }

  /**
   * Kullanım sayıları — `discount_use` KAYITLARINDAN türetilir, sayaç kolonundan değil.
   *
   * Sayaç tutulsaydı iptal/iade sonrası düzeltmek elle bir işe dönerdi ve "kim kullandı" sorusu
   * yanıtsız kalırdı; müşteri başına sınır tam da o soruyu sorar. Tek sorgu: kuralların tamamı için
   * kayıtlar toplanır, kimlik başına sayılır (kural başına sorgu N+1 olurdu).
   *
   * **Kota KURAL seviyesindedir, kod seviyesinde değil:** `total` kuralın tüm kapılarının toplamıdır.
   * `byCode` yalnız kırılımdır — hangi kodun karşılık bulduğunu söyler, tavanı bölmez. Bölseydi üç
   * kodlu bir kuponun "100 kullanım" sınırı fiilen 300 olurdu.
   *
   * **İPTAL EDİLEN SİPARİŞ KOTAYI GERİ VERİR.** Vazgeçilen bir siparişte müşteri indirimden hiç
   * yararlanmadı; hakkını yakmak, kuponu kendi hatası olmayan bir sebeple elinden almak olurdu — ve
   * bu en çok puanla alınmış kişisel kuponda acıtır (tek kullanımlık, 500 puan ödenmiş). Kayıt
   * SİLİNMEZ, sayarken dışlanır: "kim ne zaman denedi" geçmişte kalır (bkz. `DiscountUseService`).
   *
   * `returned` (iade) DIŞLANMAZ ve bu ayrım bilinçli: iade edilen sipariş gerçekleşti, indirim indi,
   * kampanya karşılığını verdi. İptal "hiç olmadı", iade "oldu ve geri döndü" demektir.
   */
  async usageCounts(discountIds: readonly string[]): Promise<Map<string, DiscountUsage>> {
    const result = new Map<string, DiscountUsage>();
    if (discountIds.length === 0) return result;

    // ÜÇ KOLON + siparişin DURUMU okunur, satırın tamamı değil (tutar ve tarih raporun işi).
    // Gömülü seçim SOL bağdır (`!inner` DEĞİL): siparişsiz kayıt da meşru (elle/idari düzeltme) ve
    // iç bağ onları sessizce düşürüp kotayı eksik sayardı.
    const { data, error } = await this.supabase
      .from('discount_use')
      .select('discount_id,customer_id,discount_code_id,order:order(status)')
      .in('discount_id', [...discountIds]);
    if (error) throw error;

    for (const raw of data ?? []) {
      const row = raw as unknown as UseCountRow;
      if (orderStatusOf(row.order) === 'cancelled') continue;
      const entry = result.get(row.discount_id) ?? { total: 0, byCustomer: new Map<string, number>(), byCode: new Map<string, number>() };
      entry.total += 1;
      if (row.customer_id) entry.byCustomer.set(row.customer_id, (entry.byCustomer.get(row.customer_id) ?? 0) + 1);
      if (row.discount_code_id) entry.byCode.set(row.discount_code_id, (entry.byCode.get(row.discount_code_id) ?? 0) + 1);
      result.set(row.discount_id, entry);
    }
    return result;
  }
}

/** `usageCounts`'un okuduğu dar satır — sayım için gereken dört alan. */
interface UseCountRow {
  discount_id: string;
  customer_id: string | null;
  discount_code_id: string | null;
  /**
   * PostgREST'in ÜRETİLMİŞ tipi çoğa-bir bağı da dizi sayıyor; çalışma zamanında tek nesne geliyor.
   * İkisi de karşılanır — tipe güvenip yalnız dizi varsaymak, gelen nesnede `status`'u hiç okumamak
   * ve her iptal edilmiş siparişi kotadan saymak olurdu. Sessizce yanlış sayan bir sayaç, hiç
   * saymayan bir sayaçtan kötüdür.
   */
  order: { status: string } | { status: string }[] | null;
}

const orderStatusOf = (order: UseCountRow['order']): string | null =>
  Array.isArray(order) ? (order[0]?.status ?? null) : (order?.status ?? null);

/** Bir kuralın kullanım sayıları: toplam (kota bunun üstünde durur) + müşteri ve kod kırılımı. */
export interface DiscountUsage {
  total: number;
  byCustomer: Map<string, number>;
  /** Kod kimliği → kaç kez tuttu. Kotayı BÖLMEZ; "hangi dil karşılık buldu" sorusunun cevabıdır. */
  byCode: Map<string, number>;
}
