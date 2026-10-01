import { Agent, fetch as undiciFetch } from 'undici';
import { setPooledSupabaseFetch } from './client';

/**
 * Node'un varsayılanı boştaki bağlantıyı 4 sn'de kapatır ve gezinmede her sayfa Supabase bağlantısını yeniden kurar; havuz onu
 * 30 sn açık tutar. Ayrı modül, çünkü `undici` edge derlemesine giremez: yalnız Node girişleri içe aktarır.
 */
const keepAlive = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 600_000 });

export function installSupabaseKeepAlive(): void {
  setPooledSupabaseFetch((url, init) => undiciFetch(url, { ...(init as object), dispatcher: keepAlive }) as unknown as Promise<Response>);
}
