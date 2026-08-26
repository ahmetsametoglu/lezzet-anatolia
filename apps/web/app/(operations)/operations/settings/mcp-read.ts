import { McpCallLogService, McpConnectionKeyService, UserProfileService, serviceDb } from '@lezzet/database';
import type { McpScope } from '@lezzet/types';

/**
 * MCP sekmesinin okuması (22.4) — "kim bağlanabiliyor ve ne yaptı".
 *
 * ── İKİ SORU, İKİ LİSTE ─────────────────────────────────────────────────────
 * Anahtar listesi operatörün YÖNETTİĞİ kümedir (üret/iptal et); çağrı izi olup biteni anlatır ve
 * operatör ona dokunmaz. Tek listede birleştirilmediler çünkü biri karar, öteki gözlem.
 *
 * ── ANAHTARLAR TEK TURDA, İZ TAVANLI ────────────────────────────────────────
 * Anahtar kümesinin doğal tavanı var (operatör elle üretir) → tek tur. Çağrı izi VERİYLE BÜYÜR →
 * tavanlı okunur (`CLAUDE.md §1` sayfalama ölçütü). Sekmenin sorusu "son ne oldu"; tarihin
 * tamamını çizmek bu ekranın işi değil ve zaten süpürülüyor (90 gün).
 */

/** Panelde son çağrı listesinin tavanı — sekme bir kayıt defteri değil, bir nabız. */
const CALL_LIMIT = 40;

export interface McpKeyView {
  id: string;
  label: string;
  scope: McpScope;
  createdAt: string;
  /** Anahtarı üreten personelin adı. `null` = kim ürettiği bilinmiyor (profil silinmiş). */
  createdByName: string | null;
  expiresAt: string;
  revokedAt: string | null;
  /** `null` = HİÇ kullanılmadı. Sıfır değil, YOK — ekran "hiç kullanılmadı" yazar. */
  lastUsedAt: string | null;
  /** Türetilmiş hâl: ekranın rozetini bu belirler, üç durum birbirini dışlar. */
  status: 'active' | 'revoked' | 'expired';
  /** Bu anahtarla yapılmış çağrı sayısı (saklama penceresi içinde). */
  callCount: number;
}

export interface McpCallView {
  id: string;
  tool: string;
  ok: boolean;
  durationMs: number;
  error: string | null;
  createdAt: string;
  /** `null` = env artçısıyla yapılmış çağrı; ekran "env anahtarı" yazar, uydurma ad göstermez. */
  keyLabel: string | null;
}

/**
 * ── ENV ARTÇISI BU PANELDEN ÖLÇÜLEMEZ (26.08, ekran denetiminde yakalandı) ──
 *
 * İlk hâlde burada `envKeyActive: Boolean(process.env.MCP_CONNECTION_KEY)` vardı ve **yanlıştı**:
 * o anahtar `apps/backend/.env.local`de yaşıyor, yani BAŞKA BİR SÜRECİN ortamında. Web sunucusu
 * onu hiçbir koşulda göremez — okuma her zaman `false` döner ve panel "ortam anahtarı yok" diye
 * yazar, oysa kapı o anahtarla açık durur.
 *
 * Bu tam olarak CLAUDE.md §1'in yasakladığı hâl: **ölçülemeyen değer sıfır değildir.** Alan
 * kaldırıldı; panel bunun yerine ölçmediği şeyi ölçmüş gibi yapmayan bir cümle yazıyor
 * (`mcp-tab.tsx`). Görüntü alınmasaydı arıza görünmezdi — tip temiz, test yeşildi.
 */
export interface McpPanelData {
  keys: McpKeyView[];
  calls: McpCallView[];
}

function statusOf(row: { revokedAt: string | null; expiresAt: string }): McpKeyView['status'] {
  if (row.revokedAt) return 'revoked';
  return Date.parse(row.expiresAt) <= Date.now() ? 'expired' : 'active';
}

export async function readMcpPanel(): Promise<McpPanelData> {
  const db = serviceDb();
  const [keys, calls] = await Promise.all([
    new McpConnectionKeyService(db).list(),
    new McpCallLogService(db).listRecent({ limit: CALL_LIMIT }),
  ]);

  // Üretici adları TOPLU: anahtar başına sorgu N+1 doğururdu ve küme zaten küçük.
  const creatorIds = [...new Set(keys.flatMap((k) => (k.createdBy ? [k.createdBy] : [])))];
  const creators = creatorIds.length > 0 ? await new UserProfileService(db).listByIds(creatorIds) : [];
  const nameById = new Map(creators.map((p) => [p.id, p.name]));

  // Çağrı sayısı OKUNAN pencereden türer, ayrı bir sorgu açılmaz: sekme "bu anahtar canlı mı"
  // sorusunu soruyor, tam sayımı değil — ve tam sayım için ayrı bir sorgu, listede N tur olurdu.
  const callsByKey = new Map<string, number>();
  for (const call of calls) {
    if (!call.connectionKeyId) continue;
    callsByKey.set(call.connectionKeyId, (callsByKey.get(call.connectionKeyId) ?? 0) + 1);
  }
  const labelById = new Map(keys.map((k) => [k.id, k.label]));

  return {
    keys: keys.map((k) => ({
      id: k.id,
      label: k.label,
      scope: k.scope,
      createdAt: k.createdAt,
      createdByName: k.createdBy ? (nameById.get(k.createdBy) ?? null) : null,
      expiresAt: k.expiresAt,
      revokedAt: k.revokedAt,
      lastUsedAt: k.lastUsedAt,
      status: statusOf(k),
      callCount: callsByKey.get(k.id) ?? 0,
    })),
    calls: calls.map((c) => ({
      id: c.id,
      tool: c.tool,
      ok: c.ok,
      durationMs: c.durationMs,
      error: c.error,
      createdAt: c.createdAt,
      keyLabel: c.connectionKeyId ? (labelById.get(c.connectionKeyId) ?? null) : null,
    })),
  };
}
