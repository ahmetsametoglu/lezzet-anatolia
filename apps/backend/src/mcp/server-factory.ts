import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { captureError, errorMessageOf, logger, SOURCES } from '@lezzet/observability';
import { morningBriefing, salesSummary, systemErrors } from './tools';
import { catalogHealth, soldOutWatch, stockWatch } from './tools-catalog';
import { customerPulse, demandSignals } from './tools-signals';
import {
  listProposals,
  proposeFeaturedFlag,
  proposeMoneyMovement,
  proposeProductDraft,
  proposePurchaseOrder,
  proposeStockIntake,
  proposeZoneExtend,
} from './tools-propose';

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
  'You can PROPOSE actions but never perform them: propose_* tools write to an approval queue and the admin applies them from the operations panel. You cannot approve your own proposals — never say something is done because you proposed it; say it is waiting for approval. For actions with no propose_* tool (prices, discounts, recipes, customer messages), explain what you would do and say that tool is not built yet.',
  'Two proposals need extra care when you present them. propose_zone_extend: applying it sends an irreversible notification to waiting customers — always tell the admin how many. propose_stock_intake: never invent an expiry date or lot number; if the document does not show it, ask.',
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
    name: 'propose_featured_flag',
    description:
      'PROPOSE (does not apply): put a category/collection/bundle on the homepage showcase, or take it off. Writes a proposal to the approval queue — the admin applies it from the operations panel. You cannot approve your own proposals. Pass target (category|collection|bundle), id, and isFeatured.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: "'category' | 'collection' | 'bundle'" },
        id: { type: 'string', description: 'Record id (uuid) — get it from catalog_health or ask the admin.' },
        isFeatured: { type: 'boolean', description: 'true = put on the showcase (default), false = remove.' },
      },
      required: ['target', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_purchase_order',
    description:
      'PROPOSE (does not apply): a draft purchase order for ONE warehouse, built from the below-threshold reorder suggestions. QUANTITIES COME FROM THE ENGINE, not from you — you pick the warehouse (and optionally the supplier); the shortfall is computed from stock thresholds. Writes to the approval queue; the admin applies it. Tells you how many OTHER suppliers still have pending shortfalls so nothing is silently dropped.',
    inputSchema: {
      type: 'object',
      properties: {
        warehouseCode: { type: 'string', description: 'Warehouse code, e.g. "STR" (see morning_briefing.reorder).' },
        supplierId: { type: 'string', description: 'Optional: restrict to one supplier; default is the largest group.' },
        note: { type: 'string', description: 'Optional note carried onto the draft order.' },
      },
      required: ['warehouseCode'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_stock_intake',
    description:
      "PROPOSE (does not apply): a goods-receipt (stock intake) built from an invoice/delivery note the ADMIN showed you. You read the document; this tool VERIFIES what you read — every variant must exist, the warehouse code must be valid, and every line needs an expiry date in YYYY-MM-DD. NEVER invent an expiry date or a lot number: if the document does not show it, ask the admin. Unit cost is optional and write-only (you cannot read purchase prices back).",
    inputSchema: {
      type: 'object',
      properties: {
        warehouseCode: { type: 'string', description: 'Which warehouse physically received the goods, e.g. "STR".' },
        lines: {
          type: 'array',
          description: 'One entry per invoice line.',
          items: {
            type: 'object',
            properties: {
              variantId: { type: 'string', description: 'Variant uuid (look it up in the catalog first).' },
              qty: { type: 'number', description: 'Positive integer.' },
              expiryDate: { type: 'string', description: 'YYYY-MM-DD — from the document/label. Never guessed.' },
              lotNumber: { type: 'string', description: 'Lot/batch number if printed.' },
              unitCostCents: { type: 'number', description: 'Purchase cost per unit in cents, if the invoice shows it.' },
            },
            required: ['variantId', 'qty', 'expiryDate'],
          },
        },
        supplierId: { type: 'string', description: 'Supplier uuid, if known.' },
        purchaseOrderId: { type: 'string', description: 'Linked purchase order, if this receipt closes one.' },
        documentNo: { type: 'string', description: 'Invoice / delivery-note number.' },
        reason: { type: 'string', description: 'One line: what this is based on (e.g. "invoice photo sent by the admin").' },
      },
      required: ['warehouseCode', 'lines'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_money_movement',
    description:
      'PROPOSE (does not apply): a manual cash/bank entry — expense, purchase payment, transfer, capital or misc. The account is matched BY NAME (you do not need its uuid). Order payments and refunds are deliberately NOT possible here: those may only come from the order flow itself, otherwise the order balance would change from two places.',
    inputSchema: {
      type: 'object',
      properties: {
        accountName: { type: 'string', description: 'Account name or part of it, e.g. "Kasa".' },
        direction: { type: 'string', description: "'out' = money leaves, 'in' = money arrives." },
        amountCents: { type: 'number', description: 'Positive integer, in cents.' },
        type: { type: 'string', description: "'purchase' | 'expense' | 'transfer' | 'capital' | 'misc'." },
        category: { type: 'string', description: 'Free-text category, e.g. "tedarik".' },
        description: { type: 'string' },
        supplierId: { type: 'string', description: 'Supplier uuid when paying a supplier.' },
        counterpartyName: { type: 'string', description: 'Who the money went to / came from, when there is no supplier record.' },
        valueDate: { type: 'string', description: 'YYYY-MM-DD; defaults to today.' },
        reason: { type: 'string' },
      },
      required: ['accountName', 'direction', 'amountCents', 'type'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_zone_extend',
    description:
      'PROPOSE (does not apply): add postal codes to an existing delivery zone — the concrete form of a "new route" proposal. Codes come from demand_signals (postal codes people asked about that we do not cover). The tool enriches each code with its request count and how many customers are WAITING for news there. IMPORTANT: applying this sends a "your area is now covered" notification to those waiting customers and CANNOT be undone — say so when you present it to the admin.',
    inputSchema: {
      type: 'object',
      properties: {
        zoneName: { type: 'string', description: 'Target delivery zone, matched by name.' },
        postalCodes: { type: 'array', items: { type: 'string' }, description: 'Codes to add, e.g. ["67400","67540"].' },
        reason: { type: 'string', description: 'Why these codes — cite the demand numbers.' },
      },
      required: ['zoneName', 'postalCodes'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_product_draft',
    description:
      "PROPOSE (does not apply): fill a draft product's empty text fields (description, ingredients) in three languages. The product STAYS a draft — publishing is a separate human decision. ALLERGENS AND STORAGE CANNOT BE SET HERE: the payload has no such fields, by design. A plausible-sounding allergen line is the one mistake that can hurt someone; report them as missing (catalog_health) and let the admin supply the supplier document.",
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product uuid from catalog_health.' },
        fields: {
          type: 'object',
          description: 'Each field is an object with tr/fr/de keys. Only description and ingredients are accepted.',
          properties: {
            description: { type: 'object', description: '{ "tr": "…", "fr": "…", "de": "…" }' },
            ingredients: { type: 'object', description: '{ "tr": "…", "fr": "…", "de": "…" }' },
          },
        },
        reason: { type: 'string' },
      },
      required: ['productId', 'fields'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_proposals',
    description:
      'The approval queue as it stands: pending proposals (id, kind, summary, age, expiry) plus the last few decided ones with their outcome (applied/rejected/failed and why). Use it to check whether you already proposed something, or to tell the admin what is waiting for them.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max pending rows, 1-50. Default 20.' } },
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
  propose_featured_flag: (a) => proposeFeaturedFlag(a),
  propose_purchase_order: (a) => proposePurchaseOrder(a),
  propose_stock_intake: (a) => proposeStockIntake(a),
  propose_money_movement: (a) => proposeMoneyMovement(a),
  propose_zone_extend: (a) => proposeZoneExtend(a),
  propose_product_draft: (a) => proposeProductDraft(a),
  list_proposals: (a) => listProposals(num(a.limit, 20)),
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
      // `String(err)` Supabase hatasında `[object Object]` üretiyordu ve model neyi düzelteceğini
      // anlayamıyordu (harici MCP denetiminin bulgusu, 09.08).
      const message = errorMessageOf(err);
      // Altyapı hatası admin hata ekranına da düşer — asistanın kendi arızası görünmez kalmasın (§8).
      void captureError(err, { source: SOURCES.mcp, context: { tool: toolName } });
      return text(`Araç hatası: ${message}`, true);
    }
  });

  return server;
}
