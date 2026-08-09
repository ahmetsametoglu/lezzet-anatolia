import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { captureError, errorMessageOf, logger, SOURCES } from '@lezzet/observability';
import { morningBriefing, salesSummary, systemErrors } from './tools';
import { catalogHealth, catalogLookup, soldOutWatch, stockWatch } from './tools-catalog';
import { customerPulse, demandSignals } from './tools-signals';
import { deliveryMap, referenceData } from './tools-reference';
import {
  listProposals,
  proposeBatchOffer,
  proposeBundleDraft,
  proposeDiscountDraft,
  proposeFeaturedFlag,
  proposeMoneyMovement,
  proposeProductCreate,
  proposeProductDraft,
  proposePurchaseOrder,
  proposeRecipeDraft,
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
  'You can PROPOSE actions but never perform them: propose_* tools write to an approval queue and the admin applies them from the operations panel. You cannot approve your own proposals — never say something is done because you proposed it; say it is waiting for approval. For actions with no propose_* tool (price changes, customer messages), explain what you would do and say that tool is not built yet.',
  'Two proposals need extra care when you present them. propose_zone_extend: applying it sends an irreversible notification to waiting customers — always tell the admin how many. propose_stock_intake: never invent an expiry date or lot number; if the document does not show it, ask.',
  'HOW THIS BUSINESS IS SHAPED — read every number through this. (1) There is NO default warehouse: stock, orders and delivery zones all belong to a specific warehouse, so "12 boxes in total" is never a fact you can act on — ask which warehouse. (2) A delivery zone IS a delivery route: it belongs to one warehouse, runs on fixed weekdays, and covers a set of postal codes. Extending a zone means adding a stop to a van that is already driving — so proximity to that zone\'s existing codes matters (delivery_map gives you the distance). (3) Prices have channels: list prices you see are b2c and VAT-INCLUSIVE, while purchase costs are VAT-EXCLUSIVE — never subtract one from the other without applying vatRate first. (4) A product carries two independent axes: whether its legal declarations are complete, and whether it is on sale. You can help with the first; the second is never yours.',
  'All data you see is aggregate and identity-free by design: no customer names/contacts, no per-product purchase prices, no message content. Do not speculate about individuals.',
  "Numbers ending in 'Cents' are euro cents — divide by 100 and format as €.",
  "Start-of-day habit: when the admin greets you or asks what's up, call morning_briefing first, and lead your answer with its `attention` list.",
  'Ground every proposal in a tool result. For a weekly route/zone proposal call delivery_map FIRST (it tells you which zones exist, which warehouse and weekdays they run on, and how far an uncovered code is from each) — demand_signals alone only tells you a code was asked for, not where it belongs. For bundle or new-product ideas use demand_signals (zero-result searches, product interest) plus catalog_health. Never invent demand, prices, or stock.',
  'FOOD SAFETY: you may record allergen and storage declarations ONLY from a document the admin gave you (label photo, supplier sheet) — never from what a product name suggests. Allergens are a closed set: pick values, never phrase a sentence. When a line is blurred or cut off, list that field in uncertainFields instead of guessing; the approval screen puts those in front of the admin. Saying "I could not read it" is always the better answer.',
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
      "Catalog completeness: totals (products, candidates, products with incomplete legal declarations) + the incomplete products themselves with EXACTLY which parts are missing (lang/ingredients/nutrition/storage/allergens), whether they have an image, and shelf life — plus the homepage showcase in two buckets: what is already flagged AND what is eligible but not flagged (active records you could propose). Use the candidates list — without it you can only ever discuss records you happened to hear about. Use this when the admin asks what needs finishing in the catalog. NOTE: allergen and storage declarations must never be invented — report them as missing and let the admin supply the supplier document.",
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max incomplete products to list, 1-50. Default 15.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'stock_watch',
    description:
      'Batches expiring within N days, per warehouse. Each row carries batchId and variantId — feed them straight into propose_batch_offer or propose_bundle_draft. Also: expiry date, DLC/DDM type, quantity, list price, last purchase price (VAT-EXCLUSIVE, while list price is VAT-INCLUSIVE — use vatRate before comparing), any open offer price, the engine decision (can_offer / offer_open / must_discard / none) and the engine-suggested offer price. DLC = safety date (cannot be sold past it → destroy); DDM = quality date (still sellable → candidate for a near-expiry offer). Sorted soonest first; capped, and says so when truncated.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Horizon in days, 1-90. Default 14.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'catalog_lookup',
    description:
      'Search the catalog by product name (matches all three languages) and get the IDENTIFIERS the propose_* tools need: productId, variantId per size, plus list price (b2c, VAT-INCLUSIVE) and last purchase price (VAT-EXCLUSIVE, null when unknown — never treat null as zero). This is the bridge between reading tools (which speak names) and writing tools (which need ids). Use it before proposing a bundle, a recipe or a product draft.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of a product name, e.g. "kek", "baklava".' },
        limit: { type: 'number', description: 'Max products, 1-25. Default 10.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'delivery_map',
    description:
      "The delivery picture in one call — call it BEFORE proposing a zone extension. Warehouses (code, city, postal code, active), delivery zones with the WAREHOUSE each belongs to, the WEEKDAYS it runs (1 = Monday) and the postal codes it already covers, plus every requested postal code we do NOT cover yet. For each of those you get how it FITS each existing route, not just how far it is: on_route (the van already passes there), extends_route (same direction, past the current end — lengthens the tour), detour (right direction but off the corridor), opposite (the wrong way from the warehouse — that means a separate trip, however short the distance looks). Distance alone misleads: a code 5 km away in the opposite direction costs more than one 15 km along the route. Zones whose codes all sit on the warehouse have no direction at all and come back separately under zonesWithoutDirection with distance only — that is 'unknown', not 'unsuitable'. Figures are straight-line approximations for RANKING, not a routing calculation.",
    inputSchema: {
      type: 'object',
      properties: { demandLimit: { type: 'number', description: 'Max requested postal codes to weigh, 1-50. Default 15.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'reference_data',
    description:
      "The names the propose_* tools make you type: cash/bank accounts, categories, collections (with whether each is already on the showcase), suppliers, and the business settings you may need to reason with (minimum basket, free-shipping threshold, shipping fee, cash-on-delivery cap, order cut-off times, near-expiry thresholds and the default offer discount, reservation TTL, payment terms). Call this instead of guessing a name and learning it from an error. A setting that comes back null was never set — the code is using its own default, do not read it as zero.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
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
    name: 'propose_batch_offer',
    description:
      "PROPOSE (does not apply): put ONE near-expiry batch on discount (stock.offer_price) so it sells before its date. This is the RIGHT tool for expiring stock — do NOT use propose_discount_draft for it: a discount covers a whole category/collection and would also cheapen fresh batches of the same product, while an offer touches only THIS batch. Get batchId from stock_watch. Price is optional: leave it out and the engine's suggestion (30% off list, configurable) is used. The engine refuses batches whose DLC has passed (destroy-only) and batches whose life is still comfortable. Once the admin approves, the batch appears in the storefront's deals band immediately — there is no draft stage.",
    inputSchema: {
      type: 'object',
      properties: {
        batchId: { type: 'string', description: 'Batch uuid from stock_watch.batchId.' },
        offerPriceCents: { type: 'number', description: 'Optional offer price in cents (VAT-inclusive). Omit to use the engine suggestion.' },
        reason: { type: 'string', description: 'Why now — e.g. "14 units, 4 days left, no other stock of this size".' },
      },
      required: ['batchId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_product_create',
    description:
      "PROPOSE (does not apply): create a NEW product from the package the admin photographed — you read the label images, this tool queues what you read. Pass name (tr/fr/de), at least one variant size, dateType (DLC = safety date, destroy when passed; DDM = quality date, still sellable), and whatever the label shows: description, ingredients, storage instructions, nutrition per 100 g, allergens and traces. ALLERGENS ARE A CLOSED SET — pick from the list, never write a sentence; an unknown value is rejected rather than silently dropped. Say which fields you could NOT read clearly in uncertainFields — the approval screen highlights them, and 'I could not read it' is always better than a confident guess. The product is created as a CANDIDATE: it is never put on sale by this tool. No price, no stock — both are separate decisions.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'object', description: 'Product name per language: { "tr": "…", "fr": "…", "de": "…" }. Turkish required.' },
        categoryName: { type: 'string', description: 'Category by NAME (resolved server-side); omit if unsure — the tool lists the existing ones.' },
        variants: { type: 'array', description: 'Sizes: [{ "label": { "tr": "500 g" } }]. At least one — a product with no size cannot be sold.' },
        dateType: { type: 'string', description: "'DLC' or 'DDM' — read it off the label." },
        shelfLifeDays: { type: 'number', description: 'Total shelf life in days, if the label states it.' },
        vatRate: { type: 'number', description: 'French food VAT: 5.5 (packaged/frozen) or 10 (immediate consumption). Default 5.5.' },
        description: { type: 'object', description: 'Per language.' },
        ingredients: { type: 'object', description: 'Per language, as printed on the label.' },
        storageInstructions: { type: 'object', description: 'Per language, as printed.' },
        nutrition: { type: 'object', description: 'Per 100 g: energyKj, energyKcal, fatG, saturatedFatG, carbohydrateG, sugarsG, proteinG, saltG.' },
        allergens: { type: 'array', description: 'Closed set of the 14 EU allergens — values only, no free text.' },
        traces: { type: 'array', description: 'Cross-contamination ("may contain"), same closed set.' },
        uncertainFields: { type: 'array', description: 'Field names you could not read clearly (blurred, cut off, glare).' },
        reason: { type: 'string', description: 'Where this came from — e.g. "label photos sent by the admin, 3 images".' },
      },
      required: ['name', 'variants', 'dateType'],
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
      'PROPOSE (does not apply): a manual cash/bank entry — expense, transfer, capital or misc. The account is matched BY NAME (you do not need its uuid). Two kinds are deliberately impossible here: order payments/refunds (those may only come from the order flow, or the order balance would change from two places) and STOCK PURCHASES (a purchase must be linked to a goods receipt — the engine rejects an unlinked one, so proposing it would only produce a queue item that can never be applied; use propose_stock_intake).',
    inputSchema: {
      type: 'object',
      properties: {
        accountName: { type: 'string', description: 'Account name or part of it, e.g. "Kasa".' },
        direction: { type: 'string', description: "'out' = money leaves, 'in' = money arrives." },
        amountCents: { type: 'number', description: 'Positive integer, in cents.' },
        type: { type: 'string', description: "'expense' | 'transfer' | 'capital' | 'misc' — no 'purchase' (goods purchases go through propose_stock_intake)." },
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
      "PROPOSE (does not apply): complete or correct an EXISTING product — name, description, ingredients, storage instructions, nutrition, allergens and traces, each in three languages where it applies. Use it to fill gaps reported by catalog_health, to translate a field that exists in one language only, or to write what the admin's label photos show. ALLERGENS ARE A CLOSED SET (pick values, never write a sentence; unknown values are rejected, not dropped). Say what you could not read clearly in uncertainFields. WRITING OVER EXISTING TEXT IS PERMANENT — there is no version history, so only overwrite a filled field when you mean to, and say so in reason. The product STAYS as it is: this tool never puts anything on sale.",
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product uuid from catalog_health or catalog_lookup.' },
        name: { type: 'object', description: 'Product name per language. Changing it does NOT change the URL (the slug is fixed at creation).' },
        description: { type: 'object', description: '{ "tr": "…", "fr": "…", "de": "…" }' },
        ingredients: { type: 'object', description: 'Per language, as printed on the label.' },
        storageInstructions: { type: 'object', description: 'Per language, as printed.' },
        nutrition: { type: 'object', description: 'Per 100 g: energyKj, energyKcal, fatG, saturatedFatG, carbohydrateG, sugarsG, proteinG, saltG.' },
        allergens: { type: 'array', description: 'Closed set of the 14 EU allergens — values only.' },
        traces: { type: 'array', description: 'Cross-contamination, same closed set.' },
        uncertainFields: { type: 'array', description: 'Field names you could not read clearly.' },
        reason: { type: 'string' },
      },
      required: ['productId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_bundle_draft',
    description:
      "PROPOSE (does not apply): a new bundle (multi-product package sold at ONE price). You choose the items and the package price; the ENGINE distributes the per-item allocated prices proportionally to their list prices — you never compute shares yourself. If the target cannot be hit exactly (cent rounding), the response says so with the residual and you MUST tell the admin. Needs at least two items. The bundle is created INACTIVE — publishing is a separate decision.",
    inputSchema: {
      type: 'object',
      properties: {
        nameTr: { type: 'string', description: 'Bundle name in Turkish (required).' },
        nameFr: { type: 'string' },
        nameDe: { type: 'string' },
        descriptionTr: { type: 'string' },
        totalPrice: { type: 'number', description: 'The single customer-facing price, in EURO (e.g. 89.00).' },
        serves: { type: 'number', description: 'How many people it serves, if meaningful.' },
        items: {
          type: 'array',
          description: 'At least two entries.',
          items: {
            type: 'object',
            properties: {
              variantId: { type: 'string', description: 'Variant uuid.' },
              qty: { type: 'number', description: 'Positive integer, default 1.' },
            },
            required: ['variantId'],
          },
        },
        reason: { type: 'string', description: 'Ground it — e.g. "these six were bought together in 41 orders last month".' },
      },
      required: ['nameTr', 'totalPrice', 'items'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_discount_draft',
    description:
      "PROPOSE (does not apply): a campaign/discount. Percent or fixed amount; scope cart, category or collection (matched BY NAME). A COUPON is always cart-scoped (domain rule) — the tool rejects any other combination. The discount is created INACTIVE: applying the proposal prepares it, publishing is a separate decision on the pricing screen. Coupon codes are not minted here — uniqueness belongs to the database.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Internal campaign name the admin will see in the list.' },
        trigger: { type: 'string', description: "'automatic' (applies by itself) | 'coupon' (customer types a code)." },
        type: { type: 'string', description: "'percent' | 'fixed'." },
        percent: { type: 'number', description: 'Required when type=percent, 0-100.' },
        amountCents: { type: 'number', description: 'Required when type=fixed, in cents.' },
        scope: { type: 'string', description: "'cart' | 'category' | 'collection'. Coupons must be 'cart'." },
        scopeName: { type: 'string', description: 'Category/collection name when scope is not cart.' },
        minBasketCents: { type: 'number', description: 'Minimum basket in cents, if any.' },
        validFrom: { type: 'string', description: 'ISO date.' },
        validTo: { type: 'string', description: 'ISO date.' },
        code: { type: 'string', description: 'Suggested coupon code (trigger=coupon only).' },
        reason: { type: 'string' },
      },
      required: ['name', 'trigger', 'type', 'scope'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_recipe_draft',
    description:
      'PROPOSE (does not apply): a "table idea" recipe that carries existing products into the cart. Ingredients bind to VARIANTS (the "350 g" row), never to a product alone. The recipe is created INACTIVE and — by a data rule — CANNOT be published until all three languages are filled; the response tells you which languages you supplied so you can warn the admin.',
    inputSchema: {
      type: 'object',
      properties: {
        nameTr: { type: 'string' },
        nameFr: { type: 'string' },
        nameDe: { type: 'string' },
        stepsTr: { type: 'string', description: 'Preparation steps, Turkish (required).' },
        stepsFr: { type: 'string' },
        stepsDe: { type: 'string' },
        descriptionTr: { type: 'string' },
        descriptionFr: { type: 'string' },
        descriptionDe: { type: 'string' },
        servesTr: { type: 'string', description: 'Free text like "4 kişilik" — not a number.' },
        servesFr: { type: 'string' },
        servesDe: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { variantId: { type: 'string' }, qty: { type: 'number' } },
            required: ['variantId'],
          },
        },
        reason: { type: 'string' },
      },
      required: ['nameTr', 'stepsTr', 'items'],
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
  catalog_lookup: (a) => catalogLookup(String(a.query ?? ''), num(a.limit, 10)),
  delivery_map: (a) => deliveryMap(num(a.demandLimit, 15)),
  reference_data: () => referenceData(),
  sold_out_watch: (a) => soldOutWatch(num(a.limit, 20)),
  demand_signals: (a) => demandSignals(num(a.days, 7)),
  customer_pulse: () => customerPulse(),
  propose_featured_flag: (a) => proposeFeaturedFlag(a),
  propose_batch_offer: (a) => proposeBatchOffer(a),
  propose_purchase_order: (a) => proposePurchaseOrder(a),
  propose_stock_intake: (a) => proposeStockIntake(a),
  propose_money_movement: (a) => proposeMoneyMovement(a),
  propose_zone_extend: (a) => proposeZoneExtend(a),
  propose_product_draft: (a) => proposeProductDraft(a),
  propose_product_create: (a) => proposeProductCreate(a),
  propose_bundle_draft: (a) => proposeBundleDraft(a),
  propose_discount_draft: (a) => proposeDiscountDraft(a),
  propose_recipe_draft: (a) => proposeRecipeDraft(a),
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
