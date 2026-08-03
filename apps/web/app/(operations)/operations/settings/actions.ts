'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AccountService, SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import { validateRoleSet } from '@lezzet/domain-core';
import { UserRoleEnum } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { constraintMessage } from '@/lib/constraint-message';
import type { ActionResult } from '@/lib/error';
import { SETTING_BY_KEY } from './settings-catalog';
import { parseSettingValue } from './settings-labels';
import { SettingWriteSchema, StaffFormSchema } from './settings-types';
import { SETTINGS_PATH } from './settings-url';

// Ayarlar ekranının yazma kapıları (09.16).
//
// **Hepsi `requireAdmin`.** Bir ayar sistemin davranışını değiştirir: kesim saati siparişin hangi
// güne yazılacağını, tavan kimin kapıda ödeyebileceğini, rol kimin neyi göreceğini belirler.
// Depocu kendi eşiğini bile değiştiremez — eşiği okuduğu ekran Stok'tur.
//
// **Sözlük olmayan anahtar YAZILAMAZ.** Kapı `SETTING_BY_KEY`'e bakar: ekranda görünmeyen bir
// anahtara bu yoldan değer yazılamaz. Serbest anahtar kabul etmek, ayar tablosunu tanımsız
// satırlarla dolduran ve hiçbir yerde okunmayan bir çöp kapısı olurdu.

const CONSTRAINT_MESSAGE: Record<string, string> = {
  settings_scoped_key: 'Bu ayarın aynı kapsam için zaten bir istisnası var. Var olanı düzenleyin.',
  settings_global_key: 'Bu ayarın genel değeri zaten yazılmış.',
  user_profiles_email_key: 'Bu e-posta başka bir kayıtta kullanılıyor.',
  user_profiles_phone_key: 'Bu telefon başka bir kayıtta kullanılıyor.',
  user_profiles_roles_not_empty: 'Kişi en az bir rol taşımalı — rolsüz bir kayıt hiçbir eksende yaşayamaz.',
  user_profiles_roles_exclusive: 'Müşteri ile personel rolleri aynı kişide olamaz.',
};

const readable = (error: unknown): string => constraintMessage(error, CONSTRAINT_MESSAGE);

// ── Ayarlar ─────────────────────────────────────────────────────────────────

/**
 * Genel değeri ya da bir istisnayı yazar.
 *
 * Tür dönüşümü ve SINIR burada uygulanır (`parseSettingValue`), istemcide değil: ekran sınırı
 * gösterip erken uyarabilir ama kuralın yürürlükte olduğu yer burasıdır — doğrudan çağrılan bir
 * eylemde istemcideki kontrol hiç koşmaz.
 */
export async function saveSettingAction(input: unknown): Promise<ActionResult<{ key: string }>> {
  try {
    await requireAdmin();
    const parsed = SettingWriteSchema.parse(input);
    const def = SETTING_BY_KEY.get(parsed.key);
    if (!def) return { data: null, error: 'Tanınmayan ayar.' };

    if (parsed.scopeType !== 'global') {
      // `some`, `includes` değil: gelen eksen kümesi (`SettingScope`) sözlüğün sunduğundan
      // (`ExceptionScope`) GENİŞ — `warehouse` arka uçta açık ama bu ekranda henüz kablolu değil.
      // Karşılaştırmanın kendisi zaten aradığımız kapı: sözlükte izinli olmayan eksen reddedilir.
      if (!def.exceptionScopes.some((scope) => scope === parsed.scopeType)) {
        return { data: null, error: 'Bu ayar için bu eksende istisna açılamaz.' };
      }
      if (!parsed.scopeId) return { data: null, error: 'İstisnanın hedefi seçilmeli.' };
    }

    const value = parseSettingValue(def, parsed.raw);
    if (!value.ok) return { data: null, error: value.error };

    /**
     * Hesap VARLIĞI burada doğrulanır — biçim `parseSettingValue`'da elendi, varlık orada
     * elenemez (saf fonksiyon veritabanını görmez).
     *
     * Ekranın seçici sunması yeterli değil: action doğrudan çağrılabilir ve o zaman uydurma bir
     * uuid ayara yazılırdı. Sonucu sessizdir ve geç anlaşılır — kapı önü satış olmayan bir hesaba
     * para yazmaya başlar, gün sonu mutabakatı tutmaz, kimse ayara bakmaz.
     *
     * PASİF hesap da reddedilir: kapatılmış hesap yeni harekete kapalıdır.
     */
    if (def.kind === 'account') {
      const account = await new AccountService(serviceDb()).getById(String(value.value));
      if (!account) return { data: null, error: 'Seçilen hesap bulunamadı.' };
      if (!account.isActive) return { data: null, error: `"${account.name}" kapatılmış bir hesap — yeni harekete kapalı.` };
    }

    // Açıklama sözlükten yazılır: satırı veritabanında görenin de ne olduğunu okuyabilmesi için.
    await new SettingsService(serviceDb()).set(def.key, value.value, {
      scopeType: parsed.scopeType,
      scopeId: parsed.scopeType === 'global' ? null : parsed.scopeId,
      description: def.help,
    });
    revalidatePath(SETTINGS_PATH);
    return { data: { key: def.key }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Genel değeri fabrika değerine döndürür.
 *
 * Satır SİLİNMEZ, fabrika değeri YAZILIR — ve fark önemli: satır silinseydi yürürlükteki değer
 * çağrı yerlerindeki koda gömülü `fallback`'e düşerdi, o da sözlüktekiyle aynı olmak zorunda
 * değil. Yazmak, ekranın gösterdiği değerin sistemin uyguladığı değer olduğunu garanti eder.
 *
 * İstisnalara DOKUNMAZ: "varsayılana dön" genel değerin sorusudur; istisnayı kaldırmak ayrı ve
 * bilinçli bir eylem.
 */
export async function resetSettingAction(input: { key: string }): Promise<ActionResult> {
  try {
    await requireAdmin();
    const def = SETTING_BY_KEY.get(input.key);
    if (!def) return { data: null, error: 'Tanınmayan ayar.' };
    // Fabrika değeri olmayan ayarda dönülecek bir yer yok (kurulum-özgü seçim). Ekran düğmeyi
    // zaten çizmiyor; kapı yine de kendi kontrolünü yapar — action doğrudan çağrılabilir ve
    // `undefined` yazmak ayarı sessizce boşaltırdı.
    if (def.fallback === undefined) {
      return { data: null, error: 'Bu ayarın fabrika değeri yok — kurulum-özgü bir seçim, sıfırlanamaz.' };
    }

    await new SettingsService(serviceDb()).set(def.key, def.fallback, { scopeType: 'global', description: def.help });
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/** İstisnayı kaldırır — o kapsam bundan sonra genel değeri okur. */
export async function removeSettingExceptionAction(input: { id: string; key: string }): Promise<ActionResult> {
  try {
    await requireAdmin();
    const svc = new SettingsService(serviceDb());
    await svc.delete(input.id);
    // Önbelleği ELLE düşürüyoruz: `set()` bunu kendi yapıyor ama `delete()` yapmaz. Düşürülmezse
    // kaldırılan istisna, süre dolana dek okunmaya devam ederdi — silinmiş bir kural yürürlükte kalırdı.
    SettingsService.invalidate(input.key);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

// ── Kullanıcı & rol ─────────────────────────────────────────────────────────

/**
 * Personel künyesi + rolleri — tek yazımda.
 *
 * Rol kümesi motora doğrulatılır (`validateRoleSet`), burada yeniden yorumlanmaz: kural
 * `domain-core`'da (müşteri ↔ personel keskin ayrım, boş küme olamaz) ve veritabanında da zorlanır.
 * Buradaki çağrı, reddi ANLAŞILIR kılmak için — kapıya varmadan sebebini söyleyebilelim.
 */
export async function saveStaffAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const form = StaffFormSchema.parse(input);

    const check = validateRoleSet(form.roles);
    if (!check.valid) {
      return {
        data: null,
        error: check.reason === 'empty' ? 'En az bir rol seçin — rolsüz bir kişi hiçbir ekrana giremez.' : 'Müşteri ile personel rolleri aynı kişide olamaz.',
      };
    }

    const svc = new UserProfileService(serviceDb());
    await svc.update({ id: form.id, name: form.name, email: form.email || null, phone: form.phone || null });
    // Kapsam rollerle BİRLİKTE yazılır: depo rolü verilip kapsamı ayrı bir adıma bırakılsaydı,
    // araya düşen bir hata kişiyi "depocu ama hiçbir depoyu göremiyor" hâlinde bırakırdı.
    await svc.setRoles(form.id, form.roles, form.warehouseIds);
    revalidatePath(SETTINGS_PATH);
    return { data: { id: form.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

const StaffCreateSchema = StaffFormSchema.omit({ id: true }).extend({
  // E-posta personelde ZORUNLU: giriş oturumu e-postayla açılıyor ve auth tetikleyicisi profili
  // e-postadan eşleştiriyor (`0002`). E-postasız bir personel kaydı hiçbir zaman giriş yapamaz.
  email: z.string().trim().email('Personel e-postası zorunlu — giriş bu adresle açılır'),
  roles: z.array(UserRoleEnum).min(1, 'En az bir rol seçin'),
});

/**
 * Yeni personel kaydı.
 *
 * **Hesabı biz açmayız, YOLUNU açarız:** profil e-posta + rollerle yazılır, kişi o adresle giriş
 * yaptığında auth tetikleyicisi profili bağlar ve rolleri OLDUĞU GİBİ bırakır (`0002`). Yani
 * davetin son adımı kişinin kendi girişidir; biz kimse adına parola kurmayız.
 *
 * Var olan bir e-posta REDDEDİLİR, sessizce personel yapılmaz: mevcut bir müşteriyi personele
 * çevirmek `customer` rolünü düşürür ve o kişinin veri görünürlüğünü değiştirir — "+ Kullanıcı"
 * düğmesinin yan etkisi olamayacak kadar büyük bir karar. O yol ayrıca açılacak
 * (`BEKLEYEN(09.16)`).
 */
export async function createStaffAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const form = StaffCreateSchema.parse(input);

    const svc = new UserProfileService(serviceDb());
    const existing = await svc.findByEmail(form.email);
    if (existing) {
      const staff = existing.roles.some((r) => r !== 'customer');
      return {
        data: null,
        error: staff
          ? `Bu e-posta zaten personel kaydında (${existing.name || 'adsız'}). Rollerini listeden düzenleyin.`
          : `Bu e-posta bir MÜŞTERİ kaydına ait (${existing.name || 'adsız'}). Aynı kişiyi personel yapmak müşteri kaydını kapatır; bu yol henüz açık değil.`,
      };
    }

    const row = await svc.insert({
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      roles: form.roles,
      warehouseIds: form.warehouseIds,
    });
    revalidatePath(SETTINGS_PATH);
    return { data: { id: row.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Pasifleştirme — **silme YOKTUR.**
 *
 * Operasyon rolleri kaldırılır, kişi `customer`a düşer: erişimi kapanır ama kaydı ve geçmişi
 * (durum kayıtlarındaki aktör, teslim ettiği siparişler) yerinde kalır (`admin-ayarlar.md §4`).
 * Depo kapsamı da boşaltılır — rolü olmayan bir kişide duran kapsam, rol geri verildiğinde eski
 * yetkiyi sessizce geri getirirdi.
 */
export async function deactivateStaffAction(input: { id: string }): Promise<ActionResult> {
  try {
    await requireAdmin();
    const svc = new UserProfileService(serviceDb());
    const row = await svc.getById(input.id);
    if (!row) return { data: null, error: 'Kayıt bulunamadı.' };

    // Son yöneticiyi düşürmek sistemi yönetilemez bırakır: ayar da rol de yalnız yöneticiden yazılır.
    if (row.roles.includes('admin')) {
      const admins = await svc.listByRole('admin');
      if (admins.length <= 1) {
        return { data: null, error: 'Sistemdeki tek yönetici pasifleştirilemez — önce başka birine yönetici rolü verin.' };
      }
    }

    await svc.setRoles(input.id, ['customer'], []);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}
