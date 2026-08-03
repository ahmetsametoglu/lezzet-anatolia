import 'server-only';
import { constraintOf } from '@lezzet/database';
import { getErrorMessage } from './error';

/**
 * Veritabanı kısıt ihlalini OKUNUR bir cümleye çeviren funnel sarmalı.
 *
 * **Kural veride, cümle burada.** Ülke başına tek kargo deposu, posta kodunun tekilliği, personel
 * e-postasının tekilliği — hepsi veritabanı kısıtıdır ve uygulama onları yeniden UYGULAMAZ. Ama
 * kısıtın kendi mesajı (`duplicate key value violates unique constraint "warehouse_code_key"`)
 * operatöre hiçbir şey anlatmaz; ne olduğunu ve ne yapması gerektiğini söyleyen cümle uygulamanın
 * işidir.
 *
 * Sözlük ÇAĞIRANDA durur, burada değil: cümle ekranın bağlamına göre değişir ("önce o depodan
 * kaldırın" yalnız depo ekranında anlamlı). Ortak olan mekanizma — kısıt adını bul, sözlükte ara,
 * bulamazsan funnel'a düş — ve o mekanizma iki ekranda birden gerekince buraya taşındı
 * (`CLAUDE.md §1`: hiçbir türde duplication yok).
 *
 * Adı bilinmeyen hata `getErrorMessage`'a düşer, yani izi yine `error_log`'a yazılır: okunur cümle
 * üretmek, hatayı kayıt dışı bırakmak değildir.
 */
export function constraintMessage(error: unknown, messages: Record<string, string>): string {
  const name = constraintOf(error);
  return (name && messages[name]) || getErrorMessage(error);
}
