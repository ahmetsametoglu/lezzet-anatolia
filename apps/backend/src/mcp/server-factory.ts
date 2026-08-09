import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { morningBriefing, salesSummary, systemErrors } from './tools';
import { catalogHealth, soldOutWatch, stockWatch } from './tools-catalog';
import { customerPulse, demandSignals } from './tools-signals';

/**
 * İstek-başına MCP Server (22.1 deneme dilimi) — stateless: durum yok, her istek kendi örneğini
 * kurar (2026-07-28 spec'inin stateless çekirdeğiyle uyumlu; petit `server-factory.ts` emsali).
 *
 * LOW-LEVEL `Server` API bilinçli (üst-seviye `McpServer` değil): araç şemaları düz JSON Schema
 * olarak tanımlı ve `tools/list`e AYNEN geçer — üretim turunda oturum-anahtarı parametresi her
 * şemaya tek yerden enjekte edilecek (petit `withSessionKey` deseni), sarmalayıcı buna izin verir.
 *
 * Araç açıklamaları İNGİLİZCE (model yüzeyi — petit kararıyla aynı); asistanın patronla konuşma
 * dili talimatta Türkçe'ye bağlanır.
 */

const INSTRUCTIONS = [
  "You are the admin assistant for Lezzet Anatolia (Turkish food e-commerce, Strasbourg). You talk to the OWNER, never to customers.",
  'Always answer the admin in TURKISH. Keep answers short and concrete; lead with what needs attention.',
  'This is the READ-ONLY phase: you can observe and propose IN WORDS, but you cannot write anything. If the admin asks you to act (create a PO, change a price, publish a product, send a message), explain what you would do and say the approval-queue phase is not built yet.',
  'All data you see is aggregate and identity-free by design: no customer names/contacts, no per-product purchase prices, no message content. Do not speculate about individuals.',
  "Numbers ending in 'Cents' are euro cents — divide by 100 and format as €.",
  "Start-of-day habit: when the admin greets you or asks what's up, call morning_briefing first, and lead your answer with its `attention` list.",
  'Ground every proposal in a tool result. For a weekly route/zone proposal use demand_signals (uncovered postal codes). For bundle or new-product ideas use demand_signals (zero-result searches, product interest) plus catalog_health. Never invent demand, prices, or stock.',
  'FOOD SAFETY: allergen and storage declarations are never guessed. If catalog_health reports them missing, ask the admin for the supplier document — a plausible-sounding allergen line is the one mistake that can hurt someone.',
  'You are NOT the customer-facing agent: you never write to customers and you never see conversation content. customer_pulse gives you counts so you can tell the admin how the inbox stands — that is the extent of your role in messaging.',
].join('\n');

/** Araç kataloğu — Faz A okumaları (AI_ADMIN_ASSISTANT §7). Testte HANDLERS ile eşliği doğrulanır. */
export const TOOLS = [
  {
    name: 'morning_briefing',
    description:
      "Daily operations briefing in ONE call: today's deliveries (count, status breakdown, revenue, cash-on-delivery), open system errors, latest system-health status, open support tickets, and per-warehouse low-stock reorder suggestions — plus an `attention` list of things that need the admin. Call this when the admin greets you or asks what's up today. Aggregates only, no customer identities.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'sales_summary',
    description:
      'Order totals over the last N days grouped by DELIVERY date (not order date): total count, status breakdown, revenue/collected/refunded cents, cash-on-delivery block. Aggregates only.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Window in days, 1-90. Default 7.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'system_errors',
    description:
      'Open error-log summary: open count plus the most recent open rows (source, scrubbed message, path, occurrence count, last seen). No stack traces, no personal data.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max rows, 1-50. Default 10.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'catalog_health',
    description:
      "Catalog completeness: totals (products, candidates, products with incomplete legal declarations) + the incomplete products themselves with EXACTLY which parts are missing (lang/ingredients/nutrition/storage/allergens), whether they have an image, and shelf life — plus which categories/collections/bundles are flagged for the homepage showcase. Use this when the admin asks what needs finishing in the catalog. NOTE: allergen and storage declarations must never be invented — report them as missing and let the admin supply the supplier document.",
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max incomplete products to list, 1-50. Default 15.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'stock_watch',
    description:
      'Batches expiring within N days, per warehouse (product, unit, warehouse code, expiry date, DLC/DDM type, quantity, and whether it is already expired). DLC = safety date (cannot be sold past it → destroy); DDM = quality date (still sellable → candidate for a near-expiry offer). Sorted soonest first; the list is capped and says so when truncated.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Horizon in days, 1-90. Default 14.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'sold_out_watch',
    description:
      'Active sellable variants with ZERO available stock across the whole network — i.e. items still on the storefront that cannot actually be bought. Complements the reorder suggestions in morning_briefing (those are below-threshold, these are already at zero).',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max rows, 1-50. Default 20.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'demand_signals',
    description:
      "Unmet demand from three angles over the last N days: (1) postal codes people asked about that we do NOT cover yet, with request counts — the raw input for a new delivery-zone/route proposal; (2) what customers searched for, and separately what they searched for and got NO results — the most direct evidence of a catalog gap; (3) product interest (views, add-to-carts, cart rate) — what gets looked at but not bought. Use this for weekly route proposals and for bundle/product ideas grounded in real demand. cartRate null means 'never shown as sellable', not zero.",
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Window in days, 1-90. Default 7.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'customer_pulse',
    description:
      'Customer-facing workload: support tickets by status, reviews awaiting moderation, and conversations awaiting a reply. COUNTS ONLY — message content and customer identities are deliberately out of scope for this assistant (the customer-facing agent and the operations screen own those). Use it to tell the admin how the inbox stands, never to answer a customer.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const;

/** Sayısal argüman — model bazen dizgi gönderir; şema reddetmek yerine varsayılana düşmek daha az kırılgan. */
function num(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * Araç → uygulama eşlemesi. Zincirli koşul yerine sözlük: araç eklemek TEK satır ve unutulan bir
 * dal derlenmeden kalmaz (`ListTools`'daki ad ile buradaki anahtar ayrışırsa çağrı "bilinmeyen
 * araç" döner — testte yakalanır).
 */
export const HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  morning_briefing: () => morningBriefing(),
  sales_summary: (a) => salesSummary(num(a.days, 7)),
  system_errors: (a) => systemErrors(num(a.limit, 10)),
  catalog_health: (a) => catalogHealth(num(a.limit, 15)),
  stock_watch: (a) => stockWatch(num(a.days, 14)),
  sold_out_watch: (a) => soldOutWatch(num(a.limit, 20)),
  demand_signals: (a) => demandSignals(num(a.days, 7)),
  customer_pulse: () => customerPulse(),
};

/** Araç sonucu zarfı — MCP metin içeriği. */
function text(payload: unknown, isError = false) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return { content: [{ type: 'text' as const, text: body }], ...(isError ? { isError: true } : {}) };
}

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'lezzet-admin-assistant', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOLS] }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const toolName = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const started = Date.now();

    try {
      const handler = HANDLERS[toolName];
      if (!handler) return text(`Bilinmeyen araç: '${toolName}'.`, true);
      const result = await handler(args);

      // Çağrı izi şimdilik LOG'a (üretimde `mcp_call_log` tablosu — §8): araç adı + süre, argüman değil.
      logger.info({ tool: toolName, ms: Date.now() - started }, 'mcp: araç çağrısı');
      return text(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Altyapı hatası admin hata ekranına da düşer — asistanın kendi arızası görünmez kalmasın (§8).
      void captureError(err, { source: SOURCES.mcp, context: { tool: toolName } });
      return text(`Araç hatası: ${message}`, true);
    }
  });

  return server;
}
