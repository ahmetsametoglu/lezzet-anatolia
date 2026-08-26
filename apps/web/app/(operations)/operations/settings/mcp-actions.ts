'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { McpConnectionKeyService, serviceDb } from '@lezzet/database';
import { McpScopeEnum } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SETTINGS_PATH } from './settings-url';

/**
 * MCP bağlantı anahtarlarının yazma yolu (22.4).
 *
 * **Guard `requireAdmin`** — ekranın kapısıyla aynı. Bir MCP anahtarı, asistanın tüm okuma
 * yüzeyini (ve `propose` kapsamındaysa kuyruğa yazma hakkını) açar; depocunun ya da kuryenin
 * eli olmamalı.
 *
 * ── DÜZ ANAHTAR BİR KEZ GÖRÜNÜR, BİR DAHA ASLA ──────────────────────────────
 * Üretim anında istemciye dönen tek yer burasıdır. Veritabanına yalnız SHA-256 yazılır; okuma
 * kapısı (`mcp-read.ts`) hash'i bile dışarı vermez. Operatör kaybederse yeni anahtar üretir —
 * "gösteremiyoruz" bir kusur değil, tasarımın kendisi. Sızan bir yedek dosyası çalışan anahtar
 * vermemeli.
 *
 * ── SİLME YOK, İPTAL VAR ────────────────────────────────────────────────────
 * `revoke` satırı bırakır. İptal edilmiş anahtarın çağrı geçmişi (`mcp_call_log`) sahipsiz
 * kalmamalı: "bu çağrıları iptal ettiğim anahtar yapmıştı" sorusu cevaplanabilir olmalıdır.
 */

/** Anahtar uzunluğu — 32 bayt (256 bit) entropi, `base64url` ile URL/başlık güvenli 43 karakter. */
const KEY_BYTES = 32;

/** Varsayılan ömür (gün) — `AI_ADMIN_ASSISTANT §4`. Parametrik: operatör üretirken kısaltabilir. */
const DEFAULT_TTL_DAYS = 90;

/** Dışa VERİLMİYOR: düz anahtarın tipi de bu dosyada kalır — okuyan taraf onu hiç görmemeli. */
interface CreatedMcpKey {
  /** Düz anahtar — YALNIZ bu cevapta var. Ekran kopyalatır, sonra bir daha gösteremez. */
  token: string;
  label: string;
}

export async function createMcpKeyAction(input: {
  label: string;
  scope: string;
  ttlDays?: number;
}): Promise<ActionResult<CreatedMcpKey>> {
  try {
    const staff = await requireAdmin();

    const label = input.label.trim();
    if (!label) throw new Error('Anahtara bir ad ver — listede onu bundan tanıyacaksın.');

    // Kapsam kapalı kümeden, istemcinin iddiasından DEĞİL. Veritabanı da reddederdi; ama reddin
    // sunucuda ve okunur bir cümleyle olması gerekiyor (`site-image-actions` ile aynı disiplin).
    const scope = McpScopeEnum.parse(input.scope);

    // Ömür [1, 365] aralığına kıstırılır: sıfır gün üretildiği an ölü bir anahtar, sınırsız gün
    // ise env anahtarının kaçtığımız kusuru olurdu.
    const ttlDays = Math.max(1, Math.min(365, Math.floor(input.ttlDays ?? DEFAULT_TTL_DAYS)));

    const token = randomBytes(KEY_BYTES).toString('base64url');
    await new McpConnectionKeyService(serviceDb()).insert({
      label,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      scope,
      // `profileId` — `user_profiles.id`, FK'nin işaret ettiği kolon (auth kimliği değil).
      createdBy: staff.profileId,
      expiresAt: new Date(Date.now() + ttlDays * 24 * 3600_000).toISOString(),
    });

    revalidatePath(SETTINGS_PATH);
    return { data: { token, label }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function revokeMcpKeyAction(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new McpConnectionKeyService(serviceDb()).revoke(id);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
