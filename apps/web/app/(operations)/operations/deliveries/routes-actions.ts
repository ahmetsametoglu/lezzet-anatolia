'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  DeliveryZonePostalCodeService,
  DeliveryZoneService,
  PostalCodePlaceService,
  WarehouseService,
  serviceDb,
  type PostalCodeSuggestion,
} from '@lezzet/database';
import { requireAdmin } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { readPostalCodesForMap } from '@/lib/delivery/map-codes';
import { constraintMessage } from '@/lib/constraint-message';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { ZoneFormSchema, type PostalCodePick } from './routes-types';

// Rota kurulumunun yazma yolları (19.20 · 09.15).
//
// **Depolar'dan BURAYA taşındı (07.08, kullanıcı kararı):** rota tanımlamak ile günü planlamak aynı
// işin iki anıdır ve tasarım ikisini tek sayfada, iki sekmede topluyor. Eylemler ekranıyla birlikte
// geldi — iki klasörden birbirine server action ithal etmek, kolokasyon kuralını (CLAUDE §2) bozup
// "bu iş nerede yaşıyor" sorusunu belirsizleştirirdi.
//
// Şema hâlâ `warehouses-types`ten geliyor ve öyle kalmalı: rota KAYDI deponun nesnesidir
// (depo → rota → kodlar), taşınan şey kurulum YÜZEYİ.
//
// **Kural VERİDE, cümle burada:** posta kodunun tekilliği bir veritabanı kısıtıdır; bu dosya onu
// yeniden uygulamaz, ihlali okunur bir cümleye çevirir. Kuralı iki yerde yazmak, bir gün ayrışan
// iki kural demektir.

/** İnsan diline çevrilmiş kısıt ihlali. Adı bilinmeyen hata olduğu gibi geçer. */
const CONSTRAINT_MESSAGE: Record<string, string> = {
  delivery_zone_postal_code_pkey:
    'Eklemek istediğiniz posta kodlarından biri başka bir rotada tanımlı. Bir kod yalnız tek rotada olabilir.',
};

const readable = (error: unknown): string => constraintMessage(error, CONSTRAINT_MESSAGE);

/**
 * Bölge ekle / düzenle — ad, teslim günleri ve kod kümesi TEK yazımda.
 *
 * Kod kümesi sil-yaz ile değişir (servis sözleşmesi): ekran kümenin son hâlini gönderir, "hangileri
 * eklendi hangileri silindi" hesabını iki tarafın da tutması gerekmez.
 *
 * **Çakışma önce OKUNUR, sonra yazılır** — ama kural yine de veritabanındadır. Buradaki ön okuma
 * kuralı uygulamak için değil, ihlali ANLATABİLMEK için: kısıt "kod zaten var" der, operatörün
 * ihtiyacı olan cümle ise "67100'ü Kuzey hattı tutuyor (COL)". Ön okuma ile yazma arasında başka
 * biri aynı kodu alırsa kısıt yine tutar; kaybedilen tek şey cümlenin ayrıntısı olur.
 */
export async function saveZoneAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const staff = await requireAdmin();
    const parsed = ZoneFormSchema.extend({
      id: z.string().uuid().optional(),
      warehouseId: z.string().uuid(),
      /**
       * Asistan önerisinden gelindiyse o önerinin kimliği (22.5). **Yoksa akış hiç değişmez** —
       * elle rota kurma yolu bu değişiklikten habersiz kalmalı.
       */
      proposalId: z.string().uuid().optional(),
    }).parse(input);
    const { id, warehouseId, postalCodes, proposalId, ...fields } = parsed;

    const db = serviceDb();
    const zoneSvc = new DeliveryZoneService(db);

    const conflict = await findConflict(db, postalCodes, id ?? null);
    if (conflict) return { data: null, error: conflict };

    /**
     * **Kayıt ile kuyruk satırı BİRLİKTE koşar** (`withProposal`): önce satır `pending`ten çıkar
     * (`claimForApply`), sonra iş yapılır, sonra sonuç damgalanır. Sıra şemanın dayattığı sıra ve
     * tek yerde durur — üç hedef ekrana kopyalansaydı biri bir gün kilidi atlar ve aynı öneri iki
     * kez uygulanırdı.
     *
     * Kaydedilen küme OPERATÖRÜN kümesidir, önerininki değil: kodları haritada görüp çıkarabilsin
     * diye buraya geliyor. Bildirim de yalnız kaydedilene gider (`zone_available` uzlaştırması
     * kapsanan kodlara bakar), yani "hepsine birden gitmesi" derdi burada kapanıyor.
     */
    const zone = await withProposal(
      proposalId,
      staff.profileId,
      async () => {
        const saved = id
          ? await zoneSvc.update({ id, warehouseId, ...fields })
          : await zoneSvc.insert({ warehouseId, ...fields });
        await zoneSvc.replacePostalCodes(saved.id, postalCodes);
        return saved;
      },
      (saved) => ({ zoneId: saved.id, postalCodeCount: String(postalCodes.length) }),
    );

    revalidatePath('/operations/deliveries');
    revalidatePath('/operations/assistant');
    return { data: { id: zone.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Kodlardan biri BAŞKA bir bölgede mi — cevabı hangi bölgenin ve hangi deponun tuttuğuyla birlikte.
 *
 * Sessiz "ilki kazanır" YOKTUR: çok depoda bunun bedeli siparişin yanlış şehre düşmesidir.
 */
async function findConflict(
  db: ReturnType<typeof serviceDb>,
  codes: readonly PostalCodePick[],
  currentZoneId: string | null,
): Promise<string | null> {
  if (codes.length === 0) return null;

  const rows = await new DeliveryZonePostalCodeService(db).listByCodes(codes.map((c) => c.postalCode));
  const mine = new Set(codes.map((c) => `${c.country}:${c.postalCode}`));
  const taken = rows.filter((r) => r.zoneId !== currentZoneId && mine.has(`${r.country}:${r.postalCode}`));
  if (taken.length === 0) return null;

  const zoneSvc = new DeliveryZoneService(db);
  const zone = await zoneSvc.getById(taken[0]!.zoneId);
  const warehouse = zone ? await new WarehouseService(db).getById(zone.warehouseId) : null;
  const list = taken.map((r) => r.postalCode).join(', ');
  const holder = zone ? `“${zone.name}”${warehouse ? ` bölgesi (${warehouse.code})` : ' bölgesi'}` : 'başka bir bölge';
  return `${list} kodu ${holder} tarafından tutuluyor. Bir kod yalnız tek bölgede olabilir — taşımak için önce o bölgeden çıkarın.`;
}

/**
 * Posta kodu önerisi — bölge kurulumunun giriş aracı.
 *
 * **Serbest metin girişi YOK:** seçenekler referans tablosundan gelir, yani haritada (ve veride)
 * olmayan bir kod sisteme hiç giremez. Yazım hatası sınıfı böyle kapanır. Öneri bir OKUMA'dır ve
 * `recordDemand` sayacını KİRLETMEZ — o sayaç niyete bağlıdır (19.7'nin kayıtlı kararı).
 */
export async function searchPostalCodesAction(term: string): Promise<ActionResult<PostalCodeSuggestion[]>> {
  try {
    await requireAdmin();
    // Terim HAM geçiyor (`OB-03`): kapı kodu mu adı mı aradığına terimin kendisinden karar veriyor.
    // Burada normalleştirmek (eski hâl `normalizePostalCode` uyguluyordu) harfleri büyütüp yolu
    // kod dalına kilitlerdi — operatör "Strasbourg" yazdığında yine sıfır sonuç alırdı.
    const rows = await new PostalCodePlaceService(serviceDb()).search(term, 12);
    return { data: rows, error: null };
  } catch (error) {
    // `readable` DEĞİL, çıplak funnel — ve bu bilinçli (denetim S2): bu uç salt OKUMA yapıyor
    // (önek araması), yani çarpabileceği bir kısıt yok. `readable` kısıt adını insan cümlesine
    // çeviriyor; hiç kısıt üretmeyen bir yola onu bağlamak, olmayan bir hâli varmış gibi göstermek
    // olurdu. Buraya bir gün yazma eklenirse `readable`'a bağlanmalı.
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * **Görüş alanındaki posta kodları** — haritanın "boşta" kodları çizebilmesinin tek yolu (19.20).
 *
 * Sayfanın kendi okuması (`routes-read`) yalnız TANIMLI kodları ve önerileri getiriyor; boştakiler
 * hiçbir rotada olmadığı için hiçbir listede yoklar. Bu uç onları getiriyor ve **kaydırmaya bağlı**
 * olduğu için sayfa okumasında değil ayrı bir eylemde: operatör haritayı gezdirdikçe küme değişiyor,
 * sayfayı yeniden çizdirmek gerekmiyor.
 *
 * Kutu ZORUNLU ve tavan var (`readPostalCodesForMap` varsayılanı 1200): ülkenin tamamı 6.065 kod ve
 * hiçbir ekran onu kullanmaz. Ekran ayrıca `truncated`'i YAZAR — sessiz kesme, operatöre olmayan
 * kodu "yok" diye okuturdu.
 */
const BboxSchema = z.object({
  minLat: z.number(),
  maxLat: z.number(),
  minLng: z.number(),
  maxLng: z.number(),
});

/**
 * Dönüş tipi KAPIDAN TÜRETİLİYOR, elle yazılmıyor.
 *
 * `MapPostalCodes` arka uç şeridinde bilerek dışa açılmamış (künyesi: *"tüketicisi doğduğu gün
 * export eklenir"*) ve o dosya onların. Türetmek hem sınırı koruyor hem de kopya bir şekil
 * bırakmıyor — kapı değişirse burası derlemede kırılır, sessizce ayrışmaz (`CLAUDE §1`).
 */
type MapCodesResult = Awaited<ReturnType<typeof readPostalCodesForMap>>;

export async function readMapCodesAction(input: unknown): Promise<ActionResult<MapCodesResult>> {
  try {
    await requireAdmin();
    const bbox = BboxSchema.parse(input);
    return { data: await readPostalCodesForMap({ bbox }), error: null };
  } catch (error) {
    // Salt OKUMA — çarpabileceği bir kısıt yok, `readable` bağlanmıyor (aynı gerekçe `searchPostalCodesAction`'da).
    return { data: null, error: getErrorMessage(error) };
  }
}
