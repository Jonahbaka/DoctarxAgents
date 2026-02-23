// ═══════════════════════════════════════════════════════════════
// Agent: Athena — Agentic Shopping & Price Arbitrage
// 7 tools: product search, price arbitrage, Stripe payment
//          intent/link, web push pay, order track, deal watcher
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { ToolDefinition } from '../../core/types.js';
import { CONFIG } from '../../core/config.js';

// ── Schemas ─────────────────────────────────────────────────

const productSearchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().min(1).max(20).optional().default(5),
  maxPriceUsd: z.number().positive().optional(),
  sortBy: z.enum(['price_asc', 'price_desc', 'relevance', 'rating']).optional().default('relevance'),
  sources: z.array(z.enum(['google_shopping', 'amazon', 'ebay', 'walmart', 'bestbuy'])).optional(),
});

const priceArbitrageSchema = z.object({
  productName: z.string().min(1),
  targetPrice: z.number().positive().optional(),
  includeUsed: z.boolean().optional().default(false),
  includeRefurbished: z.boolean().optional().default(true),
  maxShippingDays: z.number().optional(),
});

const stripePaymentIntentSchema = z.object({
  amountCents: z.number().positive().int(),
  currency: z.enum(['usd', 'eur', 'gbp']).optional().default('usd'),
  description: z.string().min(1),
  customerEmail: z.string().email().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const stripePaymentLinkSchema = z.object({
  amountCents: z.number().positive().int(),
  currency: z.enum(['usd', 'eur', 'gbp']).optional().default('usd'),
  productName: z.string().min(1),
  quantity: z.number().positive().int().optional().default(1),
});

const webPushPaymentSchema = z.object({
  paymentIntentId: z.string().min(1),
  recipientChannel: z.enum(['telegram', 'whatsapp', 'discord', 'sms', 'webchat', 'email']),
  recipientId: z.string().min(1),
  message: z.string().optional(),
});

const orderTrackerSchema = z.object({
  orderId: z.string().optional(),
  trackingNumber: z.string().optional(),
  carrier: z.enum(['usps', 'ups', 'fedex', 'dhl', 'amazon', 'other']).optional(),
});

const dealWatcherSchema = z.object({
  action: z.enum(['create', 'list', 'delete']),
  productQuery: z.string().optional(),
  targetPrice: z.number().positive().optional(),
  alertChannel: z.enum(['telegram', 'whatsapp', 'discord', 'sms', 'email']).optional(),
  alertRecipient: z.string().optional(),
  watchId: z.string().optional(),
});

// ── Tool Implementations ────────────────────────────────────

export const shoppingTools: ToolDefinition[] = [
  // ─── 1. Product Search ────────────────────────────────────
  {
    name: 'product_search',
    description: 'Search products across multiple sources (Google Shopping, Amazon, eBay, Walmart, Best Buy). Compare prices, ratings, and shipping.',
    category: 'shopping',
    inputSchema: productSearchSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = productSearchSchema.parse(input);
      ctx.logger.info(`[Athena] Product search: "${params.query}"`);

      try {
        // Use SerpAPI for Google Shopping results
        if (CONFIG.shopping.serpApiKey) {
          const queryParams = new URLSearchParams({
            api_key: CONFIG.shopping.serpApiKey,
            engine: 'google_shopping',
            q: params.query,
            num: String(params.maxResults),
          });
          if (params.maxPriceUsd) queryParams.set('tbs', `mr:1,price:1,ppr_max:${params.maxPriceUsd}`);

          const resp = await fetch(`https://serpapi.com/search?${queryParams.toString()}`, {
            signal: AbortSignal.timeout(15000),
          });
          const data = await resp.json() as Record<string, unknown>;
          const results = (data.shopping_results || []) as Array<Record<string, unknown>>;

          const products = results.slice(0, params.maxResults).map((r: Record<string, unknown>) => ({
            title: r.title,
            price: r.price,
            extractedPrice: r.extracted_price,
            source: r.source,
            link: r.link,
            thumbnail: r.thumbnail,
            rating: r.rating,
            reviews: r.reviews,
            delivery: r.delivery,
          }));

          return { success: true, data: { query: params.query, resultCount: products.length, products } };
        }

        // Fallback: construct search URLs for manual browsing
        const searchUrls = {
          google: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(params.query)}`,
          amazon: `https://www.amazon.com/s?k=${encodeURIComponent(params.query)}`,
          ebay: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(params.query)}`,
          walmart: `https://www.walmart.com/search?q=${encodeURIComponent(params.query)}`,
        };

        return {
          success: true,
          data: { query: params.query, message: 'SerpAPI not configured. Use search URLs.', searchUrls },
          metadata: { fallback: true },
        };
      } catch (err) {
        return { success: false, data: null, error: `Product search failed: ${err}` };
      }
    },
  },

  // ─── 2. Price Arbitrage ───────────────────────────────────
  {
    name: 'price_arbitrage',
    description: 'Find the best deal across multiple sources. Compares price + shipping + seller trust + delivery time. Returns ranked options with savings calculation.',
    category: 'shopping',
    inputSchema: priceArbitrageSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = priceArbitrageSchema.parse(input);
      ctx.logger.info(`[Athena] Price arbitrage: "${params.productName}"`);

      try {
        if (!CONFIG.shopping.serpApiKey) {
          return { success: false, data: null, error: 'SerpAPI not configured — set SERP_API_KEY for price comparison' };
        }

        let query = params.productName;
        if (params.includeUsed) query += ' used';
        if (params.includeRefurbished) query += ' OR refurbished';

        const queryParams = new URLSearchParams({
          api_key: CONFIG.shopping.serpApiKey,
          engine: 'google_shopping',
          q: query,
          num: '20',
          sort_by: 'price_low_to_high',
        });

        const resp = await fetch(`https://serpapi.com/search?${queryParams.toString()}`, {
          signal: AbortSignal.timeout(15000),
        });
        const data = await resp.json() as Record<string, unknown>;
        const results = (data.shopping_results || []) as Array<Record<string, unknown>>;

        const options = results
          .filter((r: Record<string, unknown>) => {
            const price = r.extracted_price as number | undefined;
            if (params.targetPrice && price && price > params.targetPrice * 1.5) return false;
            return true;
          })
          .slice(0, 10)
          .map((r: Record<string, unknown>, i: number) => ({
            rank: i + 1,
            title: r.title,
            price: r.extracted_price,
            priceFormatted: r.price,
            source: r.source,
            link: r.link,
            rating: r.rating || 0,
            delivery: r.delivery || 'Unknown',
            condition: r.second_hand_condition || 'new',
          }));

        const bestPrice = options[0]?.price as number || 0;
        const worstPrice = options[options.length - 1]?.price as number || 0;
        const savings = worstPrice - bestPrice;

        return {
          success: true,
          data: {
            product: params.productName,
            optionsFound: options.length,
            bestPrice: options[0]?.priceFormatted,
            worstPrice: options[options.length - 1]?.priceFormatted,
            maxSavings: `$${savings.toFixed(2)}`,
            options,
            recommendation: options[0] ? `Best deal: ${options[0].title} at ${options[0].priceFormatted} from ${options[0].source}` : 'No results found',
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Arbitrage failed: ${err}` };
      }
    },
  },

  // ─── 3. Stripe Payment Intent ─────────────────────────────
  {
    name: 'stripe_payment_intent',
    description: 'Create a Stripe Payment Intent for US/global payments. Returns client secret for Apple Pay/Google Pay/card checkout.',
    category: 'shopping',
    inputSchema: stripePaymentIntentSchema,
    requiresApproval: true,
    riskLevel: 'high',
    execute: async (input, ctx) => {
      const params = stripePaymentIntentSchema.parse(input);
      ctx.logger.info(`[Athena] Stripe Payment Intent: ${params.currency.toUpperCase()} ${params.amountCents}c`);

      if (!CONFIG.stripe.secretKey) {
        return { success: false, data: null, error: 'Stripe not configured — set STRIPE_SECRET_KEY' };
      }

      try {
        const body = new URLSearchParams({
          amount: String(params.amountCents),
          currency: params.currency,
          description: params.description,
          'payment_method_types[]': 'card',
          'automatic_payment_methods[enabled]': 'true',
        });
        if (params.customerEmail) body.set('receipt_email', params.customerEmail);
        if (params.metadata) {
          for (const [k, v] of Object.entries(params.metadata)) {
            body.set(`metadata[${k}]`, v);
          }
        }

        const resp = await fetch('https://api.stripe.com/v1/payment_intents', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CONFIG.stripe.secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
          signal: AbortSignal.timeout(15000),
        });

        const data = await resp.json() as Record<string, unknown>;

        if (data.id) {
          return {
            success: true,
            data: {
              paymentIntentId: data.id,
              clientSecret: data.client_secret,
              amount: data.amount,
              currency: data.currency,
              status: data.status,
            },
          };
        }

        return { success: false, data, error: `Stripe error: ${JSON.stringify(data.error || data)}` };
      } catch (err) {
        return { success: false, data: null, error: `Stripe Payment Intent failed: ${err}` };
      }
    },
  },

  // ─── 4. Stripe Payment Link ───────────────────────────────
  {
    name: 'stripe_payment_link',
    description: 'Generate a one-click Stripe Payment Link. Send via SMS, WhatsApp, Telegram — user taps to pay with Apple Pay/Google Pay/card. No app needed.',
    category: 'shopping',
    inputSchema: stripePaymentLinkSchema,
    requiresApproval: true,
    riskLevel: 'high',
    execute: async (input, ctx) => {
      const params = stripePaymentLinkSchema.parse(input);
      ctx.logger.info(`[Athena] Stripe Payment Link: ${params.productName} ${params.currency.toUpperCase()} ${params.amountCents}c`);

      if (!CONFIG.stripe.secretKey) {
        return { success: false, data: null, error: 'Stripe not configured — set STRIPE_SECRET_KEY' };
      }

      try {
        // Create a price object first
        const priceBody = new URLSearchParams({
          'unit_amount': String(params.amountCents),
          'currency': params.currency,
          'product_data[name]': params.productName,
        });

        const priceResp = await fetch('https://api.stripe.com/v1/prices', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CONFIG.stripe.secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: priceBody.toString(),
          signal: AbortSignal.timeout(10000),
        });
        const priceData = await priceResp.json() as Record<string, unknown>;

        if (!priceData.id) {
          return { success: false, data: priceData, error: 'Failed to create Stripe price' };
        }

        // Create payment link
        const linkBody = new URLSearchParams({
          'line_items[0][price]': priceData.id as string,
          'line_items[0][quantity]': String(params.quantity),
        });

        const linkResp = await fetch('https://api.stripe.com/v1/payment_links', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CONFIG.stripe.secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: linkBody.toString(),
          signal: AbortSignal.timeout(10000),
        });
        const linkData = await linkResp.json() as Record<string, unknown>;

        if (linkData.url) {
          return {
            success: true,
            data: {
              paymentLinkId: linkData.id,
              url: linkData.url,
              product: params.productName,
              amount: `${(params.amountCents / 100).toFixed(2)} ${params.currency.toUpperCase()}`,
              message: 'Payment link ready. Send to customer via any channel.',
            },
          };
        }

        return { success: false, data: linkData, error: `Payment link creation failed` };
      } catch (err) {
        return { success: false, data: null, error: `Stripe Payment Link failed: ${err}` };
      }
    },
  },

  // ─── 5. Web Push Payment ──────────────────────────────────
  {
    name: 'web_push_payment',
    description: 'Send a payment request to user via their preferred channel (Telegram, WhatsApp, SMS, etc.). User taps to pay with native Apple Pay/Google Pay sheet.',
    category: 'shopping',
    inputSchema: webPushPaymentSchema,
    requiresApproval: true,
    riskLevel: 'high',
    execute: async (input, ctx) => {
      const params = webPushPaymentSchema.parse(input);
      ctx.logger.info(`[Athena] Web push payment via ${params.recipientChannel} to ${params.recipientId}`);

      // Use the messaging tools from context to send the payment link
      const sendTool = ctx.tools.get('send_message');
      if (!sendTool) {
        return { success: false, data: null, error: 'Messaging tools not available — Hermes not initialized' };
      }

      const checkoutUrl = `${CONFIG.doctarx.apiUrl}/checkout/${params.paymentIntentId}`;
      const message = params.message || `DoctaRx Payment Request\n\nTap to pay securely:\n${checkoutUrl}`;

      const result = await sendTool.execute({
        channel: params.recipientChannel,
        recipientId: params.recipientId,
        message,
      }, ctx);

      return {
        success: result.success,
        data: {
          paymentIntentId: params.paymentIntentId,
          channel: params.recipientChannel,
          recipient: params.recipientId,
          checkoutUrl,
          sent: result.success,
        },
        error: result.error,
      };
    },
  },

  // ─── 6. Order Tracker ─────────────────────────────────────
  {
    name: 'order_tracker',
    description: 'Track order status and shipping updates across carriers (USPS, UPS, FedEx, DHL, Amazon).',
    category: 'shopping',
    inputSchema: orderTrackerSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = orderTrackerSchema.parse(input);
      ctx.logger.info(`[Athena] Order tracking: ${params.trackingNumber || params.orderId}`);

      // Check stored orders in memory
      if (params.orderId) {
        const records = await ctx.memory.recall(`orderId:${params.orderId}`, 'orders', 1);
        if (records.length > 0) {
          return { success: true, data: JSON.parse(records[0].content) };
        }
      }

      if (params.trackingNumber && params.carrier) {
        // Construct carrier tracking URLs
        const trackingUrls: Record<string, string> = {
          usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${params.trackingNumber}`,
          ups: `https://www.ups.com/track?tracknum=${params.trackingNumber}`,
          fedex: `https://www.fedex.com/fedextrack/?trknbr=${params.trackingNumber}`,
          dhl: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${params.trackingNumber}`,
          amazon: `https://www.amazon.com/gp/your-account/order-history`,
        };

        return {
          success: true,
          data: {
            trackingNumber: params.trackingNumber,
            carrier: params.carrier,
            trackingUrl: trackingUrls[params.carrier] || 'Unknown carrier',
            message: 'Use the tracking URL for real-time status.',
          },
        };
      }

      return { success: false, data: null, error: 'Provide orderId or trackingNumber + carrier' };
    },
  },

  // ─── 7. Deal Watcher ──────────────────────────────────────
  {
    name: 'deal_watcher',
    description: 'Set price alerts for products. Get notified via any channel when price drops below target. Create, list, or delete watches.',
    category: 'shopping',
    inputSchema: dealWatcherSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = dealWatcherSchema.parse(input);
      ctx.logger.info(`[Athena] Deal watcher: ${params.action}`);

      switch (params.action) {
        case 'create': {
          if (!params.productQuery || !params.targetPrice) {
            return { success: false, data: null, error: 'productQuery and targetPrice required for create' };
          }
          const watchId = `WATCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const watch = {
            id: watchId,
            productQuery: params.productQuery,
            targetPrice: params.targetPrice,
            alertChannel: params.alertChannel || 'webchat',
            alertRecipient: params.alertRecipient || '',
            createdAt: new Date().toISOString(),
            triggered: false,
          };

          await ctx.memory.store({
            agentId: ctx.agentId,
            type: 'procedural',
            namespace: 'deal_watches',
            content: JSON.stringify(watch),
            importance: 0.6,
            metadata: { watchId, productQuery: params.productQuery, targetPrice: params.targetPrice },
          });

          return { success: true, data: { watchId, ...watch, message: `Watching "${params.productQuery}" for price < $${params.targetPrice}` } };
        }

        case 'list': {
          const watches = await ctx.memory.recall('deal_watches', 'deal_watches', 50);
          return {
            success: true,
            data: {
              watches: watches.map(w => JSON.parse(w.content)),
              count: watches.length,
            },
          };
        }

        case 'delete': {
          if (!params.watchId) return { success: false, data: null, error: 'watchId required for delete' };
          await ctx.memory.forget(params.watchId);
          return { success: true, data: { deleted: params.watchId } };
        }
      }
    },
  },
];
