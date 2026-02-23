// ═══════════════════════════════════════════════════════════════
// Agent::Trading_Ops (Midas)
// Algorithmic trading, market data, portfolio management, risk
// ═══════════════════════════════════════════════════════════════

import { ToolDefinition, ToolResult, ExecutionContext } from '../../core/types.js';
import { CONFIG } from '../../core/config.js';
import { z } from 'zod';

// ── Market Data Feed ──

const MarketDataInput = z.object({
  symbols: z.array(z.string()),
  exchange: z.enum(['alpaca', 'binance', 'yahoo']).default('alpaca'),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('1d'),
});

export const marketDataTool: ToolDefinition = {
  name: 'market_data_feed',
  description: 'Fetch real-time and historical OHLCV market data for stocks and crypto.',
  category: 'trading',
  inputSchema: MarketDataInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = MarketDataInput.parse(input);
    ctx.logger.info(`Market data: ${parsed.symbols.join(',')} exchange=${parsed.exchange} interval=${parsed.interval}`);
    return {
      success: true,
      data: {
        symbols: parsed.symbols,
        exchange: parsed.exchange,
        interval: parsed.interval,
        quotes: [],
        status: `${parsed.exchange}_api_key_required`,
      },
    };
  },
};

// ── Order Executor ──

const OrderInput = z.object({
  symbol: z.string(),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive(),
  orderType: z.enum(['market', 'limit', 'stop']).default('market'),
  limitPrice: z.number().optional(),
  exchange: z.enum(['alpaca', 'binance']).default('alpaca'),
});

export const orderExecutorTool: ToolDefinition = {
  name: 'order_executor',
  description: 'Execute buy/sell orders on Alpaca (stocks) or Binance (crypto). Paper trading mode enforced by default.',
  category: 'trading',
  inputSchema: OrderInput,
  requiresApproval: true,
  riskLevel: 'critical',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = OrderInput.parse(input);
    ctx.logger.info(`Order: ${parsed.side} ${parsed.quantity} ${parsed.symbol} @ ${parsed.orderType} on ${parsed.exchange}`);

    // Enforce paper trading
    if (CONFIG.trading.paperTrading) {
      return {
        success: true,
        data: {
          orderId: `paper-${Date.now()}`,
          symbol: parsed.symbol,
          side: parsed.side,
          quantity: parsed.quantity,
          orderType: parsed.orderType,
          status: 'paper_trade_simulated',
          paperTrading: true,
          note: 'Set PAPER_TRADING=false for live execution',
        },
      };
    }

    return {
      success: true,
      data: {
        symbol: parsed.symbol,
        side: parsed.side,
        quantity: parsed.quantity,
        status: 'pending_broker_connection',
        exchange: parsed.exchange,
      },
    };
  },
};

// ── Portfolio Analyzer ──

const PortfolioInput = z.object({
  exchange: z.enum(['alpaca', 'binance', 'all']).default('all'),
});

export const portfolioAnalyzerTool: ToolDefinition = {
  name: 'portfolio_analyzer',
  description: 'Analyze current portfolio holdings, P&L, allocation, and performance metrics.',
  category: 'trading',
  inputSchema: PortfolioInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = PortfolioInput.parse(input);
    ctx.logger.info(`Portfolio analysis: exchange=${parsed.exchange}`);
    return {
      success: true,
      data: { exchange: parsed.exchange, holdings: [], totalValue: 0, pnl: 0, status: 'broker_api_required' },
    };
  },
};

// ── Risk Calculator ──

const RiskInput = z.object({
  symbol: z.string(),
  positionSize: z.number(),
  stopLoss: z.number().optional(),
  historicalDays: z.number().default(30),
});

export const riskCalculatorTool: ToolDefinition = {
  name: 'risk_calculator',
  description: 'Calculate position risk — Value at Risk (VaR), stop-loss levels, position sizing, max drawdown.',
  category: 'trading',
  inputSchema: RiskInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = RiskInput.parse(input);
    ctx.logger.info(`Risk calc: ${parsed.symbol} size=${parsed.positionSize}`);

    const maxPositionValue = parsed.positionSize * CONFIG.trading.maxPositionPct;

    return {
      success: true,
      data: {
        symbol: parsed.symbol,
        positionSize: parsed.positionSize,
        maxPositionPct: CONFIG.trading.maxPositionPct,
        maxDrawdownPct: CONFIG.trading.maxDrawdownPct,
        suggestedStopLoss: parsed.stopLoss || parsed.positionSize * (1 - CONFIG.trading.maxDrawdownPct),
        maxPositionValue,
        var95: null,
        status: 'basic_risk_computed',
      },
    };
  },
};

// ── Backtester ──

const BacktestInput = z.object({
  strategy: z.string(),
  symbols: z.array(z.string()),
  startDate: z.string(),
  endDate: z.string(),
  initialCapital: z.number().default(10000),
});

export const backtesterTool: ToolDefinition = {
  name: 'backtester',
  description: 'Backtest a trading strategy against historical data. Calculates returns, Sharpe ratio, max drawdown.',
  category: 'trading',
  inputSchema: BacktestInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = BacktestInput.parse(input);
    ctx.logger.info(`Backtest: "${parsed.strategy}" on ${parsed.symbols.join(',')} ${parsed.startDate}-${parsed.endDate}`);
    return {
      success: true,
      data: {
        strategy: parsed.strategy,
        symbols: parsed.symbols,
        period: { start: parsed.startDate, end: parsed.endDate },
        initialCapital: parsed.initialCapital,
        finalValue: null,
        returns: null,
        sharpeRatio: null,
        maxDrawdown: null,
        status: 'historical_data_required',
      },
    };
  },
};

// ── Technical Analysis ──

const TechAnalysisInput = z.object({
  symbol: z.string(),
  indicators: z.array(z.enum(['RSI', 'MACD', 'Bollinger', 'SMA', 'EMA', 'VWAP', 'ATR'])),
  period: z.number().default(14),
});

export const technicalAnalysisTool: ToolDefinition = {
  name: 'technical_analysis',
  description: 'Calculate technical indicators — RSI, MACD, Bollinger Bands, SMA, EMA, VWAP, ATR.',
  category: 'trading',
  inputSchema: TechAnalysisInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = TechAnalysisInput.parse(input);
    ctx.logger.info(`Technical analysis: ${parsed.symbol} indicators=${parsed.indicators.join(',')}`);
    return {
      success: true,
      data: {
        symbol: parsed.symbol,
        indicators: Object.fromEntries(parsed.indicators.map(i => [i, null])),
        period: parsed.period,
        status: 'market_data_required',
      },
    };
  },
};

// ── Sentiment Analyzer ──

const SentimentInput = z.object({
  symbol: z.string(),
  sources: z.array(z.enum(['news', 'reddit', 'twitter', 'sec_filings'])).default(['news']),
});

export const sentimentAnalyzerTool: ToolDefinition = {
  name: 'sentiment_analyzer',
  description: 'Analyze market sentiment for a symbol from news, social media, and SEC filings.',
  category: 'trading',
  inputSchema: SentimentInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = SentimentInput.parse(input);
    ctx.logger.info(`Sentiment: ${parsed.symbol} sources=${parsed.sources.join(',')}`);
    return {
      success: true,
      data: {
        symbol: parsed.symbol,
        sources: parsed.sources,
        overallSentiment: null,
        signals: [],
        status: 'sentiment_api_required',
      },
    };
  },
};

export const tradingTools: ToolDefinition[] = [
  marketDataTool, orderExecutorTool, portfolioAnalyzerTool,
  riskCalculatorTool, backtesterTool, technicalAnalysisTool, sentimentAnalyzerTool,
];
