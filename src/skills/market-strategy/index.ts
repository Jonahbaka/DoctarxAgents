// ═══════════════════════════════════════════════════════════════
// Skill :: Market Strategy Composition
// Orchestrates: market_data → technical_analysis → sentiment →
//   risk_calculator → backtester into a trading strategy
// ═══════════════════════════════════════════════════════════════

import { ExecutionContext, ToolResult } from '../../core/types.js';

export interface MarketStrategyConfig {
  symbol: string;
  timeframe: '1d' | '1h' | '15m' | '5m';
  strategy: 'momentum' | 'mean_reversion' | 'breakout' | 'custom';
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  backtestDays: number;
}

export async function executeMarketStrategy(
  config: MarketStrategyConfig,
  ctx: ExecutionContext
): Promise<ToolResult> {
  ctx.logger.info(`Market Strategy: ${config.symbol} ${config.strategy} (${config.riskTolerance})`);

  const analysis: Record<string, unknown> = {};
  const steps: string[] = [];

  // Step 1: Fetch market data
  const marketData = ctx.tools.get('market_data_feed');
  if (marketData) {
    ctx.logger.info('  [1/5] Fetching market data...');
    const result = await marketData.execute({
      symbol: config.symbol,
      timeframe: config.timeframe,
      source: 'yahoo',
    }, ctx);
    analysis.marketData = result.data;
    steps.push(`Market data: ${result.success ? 'fetched' : 'failed'}`);
  }

  // Step 2: Technical analysis
  const techAnalysis = ctx.tools.get('technical_analysis');
  if (techAnalysis) {
    ctx.logger.info('  [2/5] Running technical analysis...');
    const indicators = config.strategy === 'momentum'
      ? ['RSI', 'MACD', 'EMA']
      : config.strategy === 'mean_reversion'
        ? ['Bollinger', 'RSI', 'SMA']
        : ['ATR', 'VWAP', 'Bollinger'];

    const result = await techAnalysis.execute({
      symbol: config.symbol,
      indicators,
      period: 20,
    }, ctx);
    analysis.technicals = result.data;
    steps.push(`Technical analysis: ${result.success ? 'complete' : 'failed'}`);
  }

  // Step 3: Sentiment analysis
  const sentiment = ctx.tools.get('sentiment_analyzer');
  if (sentiment) {
    ctx.logger.info('  [3/5] Analyzing market sentiment...');
    const result = await sentiment.execute({
      symbol: config.symbol,
      sources: ['news', 'reddit'],
    }, ctx);
    analysis.sentiment = result.data;
    steps.push(`Sentiment: ${result.success ? 'analyzed' : 'failed'}`);
  }

  // Step 4: Risk calculation
  const riskCalc = ctx.tools.get('risk_calculator');
  if (riskCalc) {
    ctx.logger.info('  [4/5] Calculating risk parameters...');
    const positionPct = config.riskTolerance === 'conservative' ? 0.02
      : config.riskTolerance === 'moderate' ? 0.05
      : 0.08;

    const result = await riskCalc.execute({
      symbol: config.symbol,
      portfolioValue: 100000,
      riskPerTrade: positionPct,
    }, ctx);
    analysis.risk = result.data;
    steps.push(`Risk calc: ${result.success ? 'complete' : 'failed'}`);
  }

  // Step 5: Backtesting
  const backtester = ctx.tools.get('backtester');
  if (backtester) {
    ctx.logger.info('  [5/5] Backtesting strategy...');
    const result = await backtester.execute({
      symbol: config.symbol,
      strategy: config.strategy,
      days: config.backtestDays,
      initialCapital: 100000,
    }, ctx);
    analysis.backtest = result.data;
    steps.push(`Backtest (${config.backtestDays}d): ${result.success ? 'complete' : 'failed'}`);
  }

  // Store strategy memory
  await ctx.memory.store({
    agentId: ctx.agentId,
    type: 'procedural',
    namespace: 'market_strategy',
    content: `Market strategy for ${config.symbol}: ${config.strategy} (${config.riskTolerance}). Steps: ${steps.join(', ')}`,
    metadata: { symbol: config.symbol, strategy: config.strategy },
    importance: 0.8,
  });

  return {
    success: true,
    data: {
      symbol: config.symbol,
      strategy: config.strategy,
      riskTolerance: config.riskTolerance,
      steps,
      analysis,
      recommendation: generateRecommendation(analysis),
      timestamp: new Date().toISOString(),
    },
  };
}

function generateRecommendation(analysis: Record<string, unknown>): string {
  // Simple heuristic — in production Claude would synthesize all signals
  const parts: string[] = [];

  if (analysis.technicals) parts.push('Technical indicators analyzed');
  if (analysis.sentiment) parts.push('Sentiment data incorporated');
  if (analysis.risk) parts.push('Risk parameters calculated');
  if (analysis.backtest) parts.push('Historical backtest complete');

  if (parts.length === 0) return 'Insufficient data for recommendation';
  return `Strategy analysis complete with ${parts.length} signal sources. Review analysis data for trade decision.`;
}
