import { AddressService } from '@lezzet/database';
import type { Address, AddressInsert } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveAddressCountry } from '../delivery/place';
import { resolveAddressPoint } from '../delivery/geo-address';

/*
  MÜŞTERİ ADRES KAPISI — web hesap sayfasının `lib/account/addresses.ts` kurallarının paket hâli
  (21.15): ölçüt karşılandı — aynı kuralları iki yüzey istiyor (web hesap formu + mobil `shAddr`
  çekmecesi) ve kopyalamak yasak (CLAUDE §1). Web dosyası kendi yüzeyinde köprü olarak duruyor;
  benimsemesi web şeridinin işi (defter kaydı 09.08).

  Kurallar web'tekiyle BİREBİR:
  · **Sahiplik her eylemde doğrulanır** — adres kimliği istemciden gelir; sormasak konsoldan
    gönderilen bir kimlikle başkasının adresi silinebilirdi. Başkasının adresi de "bulunamadı"dır:
    varlığını doğrulamak bilgi sızdırmaktır.
  · **`isDefault` yazma yolundan DEĞİŞMEZ** — tip zaten taşımıyor, spread de edilmez. Varsayılan
    seçimi kendi eylemidir (`setDefaultCustomerAddress`): tek satırı işaretlemek yetmez, öbürlerinin
    bayrağı düşmek zorunda (web testinin yakaladığı "iki varsayılan" hatası).
  · **Varsayılan silinirse EN YENİ adres devralır** — boşta bırakmak teslimat göstergesini sessizce
    kaybettirirdi; "en yeni" müşterinin en son ilgilendiği adrestir (web künyesindeki gerekçe).
  · İlk adresin varsayılan olması SERVİSTE (`addForCustomer`) — burada tekrarlanmaz.

  Sonuç GÖRÜNÜR RETLİ döner (`updateCustomerProfile` emsali) ve başarıda HEP GÜNCEL LİSTE taşır:
  bu kapının her yazımı komşu satırları da oynatabilir (bayrak devri), tek kaydı dönmek çağıranı
  ikinci bir liste turuna mecbur bırakırdı — sözleşmenin aynı kararı (`address-api.schema.ts`).
*/

/** Yazılabilir alanlar — `isDefault` ve `customerId` BİLEREK tipin dışında (üstteki kurallar). */
export type CustomerAddressWrite = Omit<AddressInsert, 'customerId' | 'isDefault'>;

export type CustomerAddressOutcome =
  | { status: 'ok'; addresses: Address[] }
  | { status: 'not_found' | 'invalid_address' };

/**
 * Varsayılan başta, gerisi en yeniden eskiye — DB'nin tek `orderBy`ı ikincil sırayı belirsiz
 * bırakıyor ve belirsiz sıra listeyi her okuyuşta zıplatır. Sıralama burada, serviste değil:
 * "hangi sıra müşteriye anlamlı" taşıma/deneyim kararıdır, satır getirme kararı değil. Okuma ucu
 * da BU kapıdan geçer: GET ile yazma cevabı aynı sırayı dönmezse liste her kayıtta zıplar.
 */
export async function listCustomerAddresses(db: SupabaseClient, customerId: string): Promise<Address[]> {
  const rows = await new AddressService(db).listByCustomer(customerId);
  return rows.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Boş etiket "etiketsiz"dir (ekran şehri başlık yapar) — `''` ile `null` iki ayrı hâl olmasın. */
function normalized(write: Partial<CustomerAddressWrite>): Partial<CustomerAddressWrite> | null {
  const out: Partial<CustomerAddressWrite> = { ...write };
  if (out.label !== undefined) out.label = out.label?.trim() || null;
  if (out.line2 !== undefined) out.line2 = out.line2?.trim() || null;
  if (out.line1 !== undefined) {
    out.line1 = out.line1.trim();
    if (!out.line1) return null;
  }
  if (out.city !== undefined) {
    out.city = out.city.trim();
    if (!out.city) return null;
  }
  if (out.postalCode !== undefined) out.postalCode = out.postalCode.trim();
  return out;
}

/** Sahiplik süzgeci — müşterinin kendi listesinde aranır, tekil sorguyla değil: tek yol, tek kural. */
async function ownedAddress(service: AddressService, customerId: string, addressId: string): Promise<Address | null> {
  const own = (await service.listByCustomer(customerId)).find((a) => a.id === addressId);
  return own ?? null;
}

export async function addCustomerAddress(
  db: SupabaseClient,
  input: { customerId: string } & CustomerAddressWrite,
): Promise<CustomerAddressOutcome> {
  const { customerId, ...write } = input;
  const clean = normalized(write);
  if (!clean) return { status: 'invalid_address' };

  /* ÜLKE KODDAN TÜRER (21.28), ama kaydı ENGELLEMEZ: çözülemezse alan hiç yazılmaz ve kolon kendi
     varsayılanına düşer. Adres defteri hizmet alanımızı bilmez — müşteri adresini dilediği yere
     girer (kullanıcı kararı 10.08). */
  const country = await resolveAddressCountry(db, { postalCode: clean.postalCode ?? write.postalCode, country: write.country });

  const service = new AddressService(db);
  // Spread sırası bilinçli: `write` tam gövdenin TİPİNİ kurar, `clean` aynı alanların temizlenmiş
  // DEĞERLERİNİ üstüne yazar — `as` cast'ine gerek kalmaz. Ülke EN SONA yazılır: kapının doğruladığı
  // değer kazanmalı, istemcinin gönderdiği ham alan değil.
  await service.addForCustomer({ ...write, ...clean, ...(country === null ? {} : { country }), customerId });
  return { status: 'ok', addresses: await listCustomerAddresses(db, customerId) };
}

export async function updateCustomerAddress(
  db: SupabaseClient,
  input: { customerId: string; addressId: string; patch: Partial<CustomerAddressWrite> },
): Promise<CustomerAddressOutcome> {
  const service = new AddressService(db);
  const current = await ownedAddress(service, input.customerId, input.addressId);
  if (!current) return { status: 'not_found' };

  const clean = normalized(input.patch);
  if (!clean) return { status: 'invalid_address' };

  // Alanlar TEK TEK aktarılır, `patch` spread edilmez: tipin dışladığı `isDefault` çalışma
  // zamanında da (tipsiz çağıran, JSON gövde) bu kapıdan sızamaz — web künyesindeki ders.
  const { label, recipient, line1, line2, postalCode, city, phone } = clean;

  /* ÜLKE KODUN PEŞİNDEN GİDER (21.28): kod değişmişse ülke de değişmiş olabilir ve eski satırın
     ülkesini olduğu yerde bırakmak, adresi Almanya'ya taşıyıp Fransız KDV'siyle faturalamak
     demekti. Kod verilmediyse MEVCUT kod üzerinden doğrulanır — `country` tek başına da
     gönderilebiliyor ve o hâlde de bir beyan değil, doğrulanmış bir seçim olmalı.

     Çözülemezse (`null`) alan GÜNCELLENMEZ: mevcut satırın ülkesi olduğu gibi kalır. Burada `null`
     yazmak, bilinmeyeni bir değere çevirmek olurdu.

     **Ne kod ne ülke değiştiyse SORULMAZ:** cevap zaten satırda duruyor (`current.country`) ve
     referansa gitmek her etiket düzenlemesine bir gidiş-dönüş eklerdi. Sorgu ucuz (indeks taraması,
     0,14 ms ölçüldü) ama gereksiz bir tur, ölçülen bir yavaşlamadan önce de gereksizdir. */
  const codeChanged = postalCode !== undefined && postalCode !== current.postalCode;
  const country =
    codeChanged || clean.country !== undefined
      ? await resolveAddressCountry(db, { postalCode: postalCode ?? current.postalCode, country: clean.country })
      : null;

  /* NOKTA DA KODUN PEŞİNDEN GİDER (11.9) — ve bu, ülke kuralının kardeşi.
     Adres satırı/kodu/şehri değiştiyse eski koordinat artık BU adresin cevabı değildir. Yazılmazsa
     en sinsi arıza doğar: müşteri adresini düzeltir, kurye ESKİ kapıya sıralanır ve hiçbir ekran
     bunu söylemez. Düşen satır tarama kuyruğuna girer (`geocodeAddressesScan`) ve yeniden çözülür. */
  const geo = await resolveAddressPoint(db, {
    postalCode: postalCode ?? current.postalCode,
    current: {
      line1: current.line1,
      postalCode: current.postalCode,
      city: current.city,
      geo: {
        lat: current.lat,
        lng: current.lng,
        geoPrecision: current.geoPrecision,
        geoSource: current.geoSource,
        geoAt: current.geoAt,
        geoCheckedAt: current.geoCheckedAt,
        geoAttempts: current.geoAttempts,
      },
    },
    next: {
      line1: line1 ?? current.line1,
      postalCode: postalCode ?? current.postalCode,
      city: city ?? current.city,
    },
  });

  await service.update({
    id: input.addressId,
    label,
    recipient,
    line1,
    line2,
    postalCode,
    city,
    phone,
    ...(country === null ? {} : { country }),
    ...geo,
  });
  return { status: 'ok', addresses: await listCustomerAddresses(db, input.customerId) };
}

export async function setDefaultCustomerAddress(
  db: SupabaseClient,
  input: { customerId: string; addressId: string },
): Promise<CustomerAddressOutcome> {
  const service = new AddressService(db);
  if (!(await ownedAddress(service, input.customerId, input.addressId))) return { status: 'not_found' };

  await service.setDefault(input.addressId);
  return { status: 'ok', addresses: await listCustomerAddresses(db, input.customerId) };
}

export async function deleteCustomerAddress(
  db: SupabaseClient,
  input: { customerId: string; addressId: string },
): Promise<CustomerAddressOutcome> {
  const service = new AddressService(db);
  const own = await ownedAddress(service, input.customerId, input.addressId);
  if (!own) return { status: 'not_found' };

  await service.delete(input.addressId);
  if (own.isDefault) {
    const rest = await service.listByCustomer(input.customerId);
    const newest = rest.reduce<Address | null>(
      (best, row) => (!best || row.createdAt > best.createdAt ? row : best),
      null,
    );
    // Son adres de silindiyse yapacak bir şey yok: varsayılan kavramı boş listede anlamsız.
    if (newest) await service.setDefault(newest.id);
  }
  return { status: 'ok', addresses: await listCustomerAddresses(db, input.customerId) };
}
