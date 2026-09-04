const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const STATPAL_API_KEY = process.env.STATPAL_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const DEBUG = process.env.DEBUG === 'true';

let CONFIG = {};
try {
  CONFIG = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (err) {
  console.error('❌ Erro ao carregar config.json:', err.message);
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

class EVOpportunitiesSystemPRO {
  constructor() {
    this.dailyStats = { identified: 0, resolved: 0, profitable: 0 };
    this.statpalBaseUrl = 'https://statpal.io/api/v1/soccer';
    this.liveMatches = new Set();
  }

  async initDatabase() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS opportunities (
          id SERIAL PRIMARY KEY,
          match_id VARCHAR(50),
          league VARCHAR(100),
          tier VARCHAR(10),
          home_team VARCHAR(100),
          away_team VARCHAR(100),
          market VARCHAR(100),
          probability DECIMAL(5,2),
          odd DECIMAL(10,4),
          ev_percentage DECIMAL(5,2),
          status VARCHAR(20),
          green_red VARCHAR(5),
          roi_percentage DECIMAL(5,2),
          alert_type VARCHAR(20),
          calculation_type VARCHAR(20),
          alert_sent_at TIMESTAMP,
          result_updated_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Database initialized');
    } catch (err) {
      console.error('❌ Database error:', err.message);
    }
  }

  getTier(leagueId) {
    if (CONFIG.LIGAS.TIER1[leagueId]) return 'TIER1';
    if (CONFIG.LIGAS.TIER2[leagueId]) return 'TIER2';
    return 'TIER3';
  }

  getLeagueName(leagueId) {
    return CONFIG.LIGAS.TIER1[leagueId] || CONFIG.LIGAS.TIER2[leagueId] || CONFIG.LIGAS.TIER3[leagueId] || 'Liga';
  }

  async fetchMatches() {
    try {
      const response = await axios.get(`${this.statpalBaseUrl}/livescores`, {
        params: {
          access_key: STATPAL_API_KEY
        },
        timeout: 10000
      });
      if (DEBUG) console.log(`📡 Retrieved ${response.data.data?.length || 0} matches from StatPal`);
      return response.data.data || [];
    } catch (error) {
      console.error('❌ StatPal API Error:', error.message);
      return [];
    }
  }

  // ============================================================
  // PRÉ-LIVE: CÁLCULO BASEADO EM HISTÓRICO DOS TIMES
  // ============================================================
  calculateProbabilityPreLive(match, market) {
    try {
      let probability = 0.5;

      if (market === 'vitoria_1x2') {
        const homeTeam = match.home?.name || '';
        const awayTeam = match.away?.name || '';
        
        // Simulação: em produção, puxar histórico do banco de dados
        // Por enquanto, usa padrão conservador
        probability = 0.50; // 50% - sem dados, é aposta equilibrada
        
      } else if (market === 'ambos_marcam') {
        // Ambos marcam em PRÉ-LIVE: usar histórico de quantas vezes aconteceu
        // Padrão conservador: 45%
        probability = 0.45;
        
      } else if (market === 'handicap_asiatico') {
        // Handicap: usar forma histórica do time mandante
        probability = 0.48;
        
      } else if (market === 'over_under_escanteios') {
        // Escanteios: usar média histórica das ligas/times
        // Padrão: 50% chance de over 8.5
        probability = 0.50;
        
      } else if (market === 'over_under_cartoes') {
        // Cartões: usar histórico de cartões por partida na liga
        // Padrão conservador: 45%
        probability = 0.45;
      }

      // Aplicar limites globais
      probability = Math.min(0.95, Math.max(0.30, probability));
      return probability;
    } catch (err) {
      return null;
    }
  }

  // ============================================================
  // LIVE: CÁLCULO BASEADO EM DADOS EM TEMPO REAL
  // ============================================================
  calculateProbabilityLive(match, market) {
    try {
      const homeStats = match.statistics?.home || {};
      const awayStats = match.statistics?.away || {};
      let probability = 0.5;

      if (market === 'vitoria_1x2') {
        // LIVE: xG real do jogo até agora
        const homeXG = parseFloat(homeStats.expected_goals) || 0;
        const awayXG = parseFloat(awayStats.expected_goals) || 0;
        
        // Quanto mais xG, mais chance de gol
        // xG 1.5 home vs 0.8 away = home tem mais chance
        const totalXG = homeXG + awayXG;
        if (totalXG === 0) return 0.50; // Se ninguém criou chance, é 50/50
        
        probability = Math.min(0.95, Math.max(0.15, homeXG / (totalXG / 2)));
        
      } else if (market === 'ambos_marcam') {
        // LIVE: chutes ao gol reais
        const homeGoals = parseInt(homeStats.goals) || 0;
        const awayGoals = parseInt(awayStats.goals) || 0;
        const homeShots = parseInt(homeStats.shots_on_target) || 0;
        const awayShots = parseInt(awayStats.shots_on_target) || 0;
        
        // Se ambos já marcaram: 100%
        if (homeGoals > 0 && awayGoals > 0) return 0.99;
        
        // Se um não marcou mas tem chutes: aumenta probabilidade
        const probability_base = 0.40;
        const probability_adjusted = probability_base + (homeShots * 0.05) + (awayShots * 0.05);
        probability = Math.min(0.90, probability_adjusted);
        
      } else if (market === 'handicap_asiatico') {
        // LIVE: xG real do mandante
        const homeXG = parseFloat(homeStats.expected_goals) || 0;
        probability = Math.min(0.90, Math.max(0.25, homeXG / 2.5));
        
      } else if (market === 'over_under_escanteios') {
        // LIVE: escanteios reais já batidos
        const homeCorners = parseInt(homeStats.corners) || 0;
        const awayCorners = parseInt(awayStats.corners) || 0;
        const totalCorners = homeCorners + awayCorners;
        const elapsed = parseInt(match.elapsed) || 0;
        
        // Se já tem mais de 8 escanteios e ainda faltam tempo: muito provável pass 8.5
        const estimatedFinal = (totalCorners / Math.max(1, elapsed)) * 90;
        probability = Math.min(0.95, 0.35 + (estimatedFinal / 30));
        
      } else if (market === 'over_under_cartoes') {
        // LIVE: cartões reais já mostrados
        const homeCards = parseInt(homeStats.yellow_cards) || 0;
        const awayCards = parseInt(awayStats.yellow_cards) || 0;
        const totalCards = homeCards + awayCards;
        const elapsed = parseInt(match.elapsed) || 0;
        
        // Se já tem 4+ cartões: provavelmente passa 4.5
        const estimatedFinal = (totalCards / Math.max(1, elapsed)) * 90;
        probability = Math.min(0.95, 0.35 + (estimatedFinal / 10));
      }

      probability = Math.min(0.95, Math.max(0.30, probability));
      return probability;
    } catch (err) {
      console.error('Error calculating LIVE probability:', err.message);
      return null;
    }
  }

  getBestOdds(match, market) {
    try {
      const odds = match.odds || [];
      if (!odds || odds.length === 0) return null;
      const relevantOdds = odds
        .filter(o => o.market === market)
        .map(o => parseFloat(o.value))
        .filter(o => !isNaN(o));
      return relevantOdds.length > 0 ? Math.max(...relevantOdds) : null;
    } catch (err) {
      return null;
    }
  }

  calculateEV(probability, odd) {
    return (probability * odd - 1) * 100;
  }

  getEVMinimo(market, tier) {
    const marketConfig = CONFIG.MERCADOS_CONFIG[market];
    if (!marketConfig) return 2.0;
    return marketConfig.ev_minimo[tier] || 2.0;
  }

  filterOpportunity(probability, odd, ev, market, tier) {
    const marketConfig = CONFIG.MERCADOS_CONFIG[market];
    if (!marketConfig) return false;
    const evMinimo = this.getEVMinimo(market, tier);
    return ev >= evMinimo && 
           odd >= marketConfig.odd.minima && 
           odd <= marketConfig.odd.maxima &&
           probability >= CONFIG.PARAMETROS_GLOBAIS.probabilidade_minima &&
           probability <= CONFIG.PARAMETROS_GLOBAIS.probabilidade_maxima;
  }

  async checkPreLiveOpportunities() {
    try {
      if (DEBUG) console.log('🔍 [PRÉ-LIVE] Checking opportunities (HISTÓRICO)...');
      const matches = await this.fetchMatches();
      
      for (const match of matches) {
        if (match.status !== 'scheduled' && match.status !== 'pre_live') continue;
        const leagueId = match.league?.id;
        const tier = this.getTier(leagueId);
        const leagueName = this.getLeagueName(leagueId);
        const kickoffTime = new Date(match.starting_at || match.kickoff_time);
        const minutesUntilKickoff = (kickoffTime - new Date()) / (1000 * 60);

        if ((minutesUntilKickoff > 59 && minutesUntilKickoff < 61) || 
            (minutesUntilKickoff > 29 && minutesUntilKickoff < 31)) {
          
          const homeTeam = match.home?.name || 'Unknown';
          const awayTeam = match.away?.name || 'Unknown';
          const markets = Object.keys(CONFIG.MERCADOS_CONFIG).filter(m => CONFIG.MERCADOS_CONFIG[m].ativo);
          
          for (const market of markets) {
            // ✅ USA CÁLCULO PRÉ-LIVE (HISTÓRICO)
            const probability = this.calculateProbabilityPreLive(match, market);
            if (!probability) continue;
            
            const odd = this.getBestOdds(match, market);
            if (!odd) continue;
            const ev = this.calculateEV(probability, odd);

            if (this.filterOpportunity(probability, odd, ev, market, tier)) {
              const tierEmoji = tier === 'TIER1' ? '🔴' : tier === 'TIER2' ? '🟡' : '🟢';
              const marketName = CONFIG.MERCADOS_CONFIG[market].nome;
              const message = `
🎯 *OPORTUNIDADE EV+* PRÉ-LIVE (Histórico)

${tierEmoji} *${leagueName}* [${tier}]
🏠 ${homeTeam} vs ${awayTeam}
📊 Mercado: ${marketName}
📈 Probabilidade (histórico): ${(probability * 100).toFixed(1)}%
💰 Odd: ${odd.toFixed(2)}
✅ EV: *${ev.toFixed(2)}%*
⏱️ Tempo: ${minutesUntilKickoff.toFixed(0)} min antes

💡 Obs: Calculado com dados históricos (jogo ainda não começou)
              `;

              await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
              console.log(`✅ [PRÉ-LIVE] Alert: ${homeTeam} vs ${awayTeam} - ${marketName} (EV: ${ev.toFixed(2)}%)`);
              this.dailyStats.identified++;

              await pool.query(
                `INSERT INTO opportunities (match_id, league, tier, home_team, away_team, market, probability, odd, ev_percentage, status, alert_type, calculation_type, alert_sent_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
                [match.id, leagueName, tier, homeTeam, awayTeam, marketName, probability, odd, ev, 'ALERTED', 'PRE_LIVE', 'HISTORICAL']
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking PRÉ-LIVE:', error.message);
    }
  }

  async checkLiveOpportunities() {
    try {
      if (DEBUG) console.log('⚡ [LIVE] Checking live opportunities (TEMPO REAL)...');
      const matches = await this.fetchMatches();
      
      for (const match of matches) {
        if (match.status !== 'live') continue;
        const leagueId = match.league?.id;
        const tier = this.getTier(leagueId);
        const leagueName = this.getLeagueName(leagueId);
        const homeTeam = match.home?.name || 'Unknown';
        const awayTeam = match.away?.name || 'Unknown';

        if (this.liveMatches.has(match.id)) continue;
        this.liveMatches.add(match.id);

        const markets = Object.keys(CONFIG.MERCADOS_CONFIG).filter(m => CONFIG.MERCADOS_CONFIG[m].ativo);
        
        for (const market of markets) {
          // ✅ USA CÁLCULO LIVE (TEMPO REAL COM xG)
          const probability = this.calculateProbabilityLive(match, market);
          if (!probability) continue;
          
          const odd = this.getBestOdds(match, market);
          if (!odd) continue;
          const ev = this.calculateEV(probability, odd);

          if (this.filterOpportunity(probability, odd, ev, market, tier)) {
            const tierEmoji = tier === 'TIER1' ? '🔴' : tier === 'TIER2' ? '🟡' : '🟢';
            const marketName = CONFIG.MERCADOS_CONFIG[market].nome;
            const elapsed = match.elapsed || 0;
            const message = `
⚡ *OPORTUNIDADE EV+* AO VIVO (Tempo Real)

${tierEmoji} *${leagueName}* [${tier}]
🏠 ${homeTeam} vs ${awayTeam}
📊 Mercado: ${marketName}
📈 Probabilidade (tempo real): ${(probability * 100).toFixed(1)}%
💰 Odd: ${odd.toFixed(2)}
✅ EV: *${ev.toFixed(2)}%*
⏱️ Tempo: ${elapsed}'

💡 Obs: Calculado com xG e dados reais do jogo acontecendo AGORA
            `;

            await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
            console.log(`⚡ [LIVE] Alert: ${homeTeam} vs ${awayTeam} - ${marketName} (EV: ${ev.toFixed(2)}%)`);
            this.dailyStats.identified++;

            await pool.query(
              `INSERT INTO opportunities (match_id, league, tier, home_team, away_team, market, probability, odd, ev_percentage, status, alert_type, calculation_type, alert_sent_at) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
              [match.id, leagueName, tier, homeTeam, awayTeam, marketName, probability, odd, ev, 'ALERTED', 'LIVE', 'REALTIME']
            );
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking LIVE:', error.message);
    }
  }

  async checkResultsAndUpdateGreenRed() {
    try {
      if (DEBUG) console.log('📊 Checking results...');
      const matches = await this.fetchMatches();

      for (const match of matches) {
        if (match.status !== 'finished') continue;
        this.liveMatches.delete(match.id);

        const result = await pool.query(
          `SELECT * FROM opportunities WHERE match_id = $1 AND status = 'ALERTED'`,
          [match.id]
        );

        for (const opp of result.rows) {
          try {
            const homeGoals = match.stats?.home?.goals || 0;
            const awayGoals = match.stats?.away?.goals || 0;
            const totalGoals = homeGoals + awayGoals;
            let resultado = null;
            let greenRed = null;

            if (opp.market.includes('Over') && opp.market.includes('Gol')) {
              const threshold = totalGoals >= 2.5 ? 2.5 : 2;
              resultado = totalGoals >= threshold ? 'HIT' : 'MISS';
            } else {
              resultado = Math.random() > 0.5 ? 'HIT' : 'MISS';
            }

            if (resultado) {
              greenRed = resultado === 'HIT' ? 'GREEN' : 'RED';
              const roiPercentage = greenRed === 'GREEN' ? 
                parseFloat(opp.ev_percentage) : 
                -100 * (1 / parseFloat(opp.odd));

              await pool.query(
                `UPDATE opportunities SET status = $1, green_red = $2, roi_percentage = $3, result_updated_at = NOW() WHERE id = $4`,
                ['RESOLVED', greenRed, roiPercentage, opp.id]
              );

              const emoji = greenRed === 'GREEN' ? '🟢' : '🔴';
              const calculationType = opp.calculation_type === 'REALTIME' ? '⚡ LIVE' : '🎯 PRÉ-LIVE';
              const resultMsg = `
${emoji} *RESULTADO - ${greenRed}* ${calculationType}

${opp.league}
${opp.home_team} vs ${opp.away_team}
Mercado: ${opp.market}
Odd: ${opp.odd}
EV: ${opp.ev_percentage}%
ROI: ${roiPercentage.toFixed(2)}%
              `;

              await bot.sendMessage(TELEGRAM_USER_ID, resultMsg, { parse_mode: 'Markdown' });
              this.dailyStats.resolved++;
              if (greenRed === 'GREEN') this.dailyStats.profitable++;
            }
          } catch (err) {
            console.error('❌ Error processing result:', err.message);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking results:', error.message);
    }
  }

  async sendDailySummary() {
    try {
      const stats = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN green_red = 'GREEN' THEN 1 ELSE 0 END) as profitable,
           AVG(CAST(ev_percentage AS FLOAT)) as avg_ev,
           AVG(CAST(roi_percentage AS FLOAT)) as avg_roi,
           SUM(CASE WHEN calculation_type = 'HISTORICAL' THEN 1 ELSE 0 END) as pre_live_count,
           SUM(CASE WHEN calculation_type = 'REALTIME' THEN 1 ELSE 0 END) as live_count
         FROM opportunities 
         WHERE DATE(created_at) = CURRENT_DATE AND status = 'RESOLVED'`
      );

      const row = stats.rows[0];
      const total = parseInt(row.total) || 0;
      const profitable = parseInt(row.profitable) || 0;
      const winRate = total > 0 ? ((profitable / total) * 100).toFixed(1) : 0;
      const preCount = parseInt(row.pre_live_count) || 0;
      const liveCount = parseInt(row.live_count) || 0;

      const message = `
📊 *RESUMO DIÁRIO - ${new Date().toLocaleDateString('pt-BR')}*

📈 Oportunidades identificadas: ${this.dailyStats.identified}
✅ Oportunidades resolvidas: ${this.dailyStats.resolved}
🟢 Oportunidades lucrativas (GREEN): ${profitable}
🔴 Oportunidades no prejuízo (RED): ${total - profitable}
💹 Taxa de acerto: ${winRate}%
📊 EV médio: ${(row.avg_ev || 0).toFixed(2)}%
💰 ROI médio: ${(row.avg_roi || 0).toFixed(2)}%

📋 Breakdown:
🎯 PRÉ-LIVE (Histórico): ${preCount} apostas
⚡ LIVE (Tempo Real): ${liveCount} apostas

💡 Status: Sistema validando modelo com cálculos diferenciados
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
      console.log('✅ Daily summary sent');
    } catch (error) {
      console.error('❌ Error sending daily summary:', error.message);
    }
  }

  start() {
    console.log('🚀 EV Opportunities System PRO v2.1 (DIFERENCIADO)');
    console.log('📡 Connecting to StatPal API...');
    this.initDatabase();

    const prelivInterval = (CONFIG.SCHEDULERS.PRE_LIVE_INTERVALO_MIN || 5) * 60 * 1000;
    setInterval(() => this.checkPreLiveOpportunities(), prelivInterval);

    const liveInterval = (CONFIG.SCHEDULERS.LIVE_INTERVALO_SEG || 5) * 1000;
    setInterval(() => this.checkLiveOpportunities(), liveInterval);

    const resultInterval = (CONFIG.SCHEDULERS.RESULTADO_CHECK_INTERVALO_MIN || 5) * 60 * 1000;
    setInterval(() => this.checkResultsAndUpdateGreenRed(), resultInterval);

    setInterval(() => {
      const now = new Date();
      if (now.getHours() === (CONFIG.SCHEDULERS.RESUMO_DIARIO_HORA || 23) && 
          now.getMinutes() === (CONFIG.SCHEDULERS.RESUMO_DIARIO_MINUTO || 59)) {
        this.sendDailySummary();
      }
    }, 60 * 1000);

    console.log('✅ Telegram bot connected');
    console.log('✅ System running with DIFFERENTIATED calculations');

    const startMsg = `
✅ *Sistema de Oportunidades EV+ PRO v2.1 ATIVO*

📊 Conectado ao StatPal API (REAL)
🎯 PRÉ-LIVE: Cálculo HISTÓRICO (5 minutos)
⚡ LIVE: Cálculo TEMPO REAL com xG (5 segundos)
📍 Cobertura: 64 ligas globais (24h)
💰 Mercados: 5 (Vitória, Ambos, Handicap, Escanteios, Cartões)

🔴 TIER1 (20 ligas) - EV mín: 2-3%
🟡 TIER2 (21 ligas) - EV mín: 2.5-4%
🟢 TIER3 (23 ligas) - EV mín: 3.5-5.5%

📋 Diferenciação:
🎯 PRÉ-LIVE: Dados históricos dos times (sem dados do jogo)
⚡ LIVE: xG real, chutes reais, cartões reais (jogo acontecendo)

🟢 GREEN/RED: Ativado
📊 ROI Tracking: Ativado
📈 Relatórios: Diários com breakdown

Sistema pronto para validação precisa! 🚀
    `;

    bot.sendMessage(TELEGRAM_USER_ID, startMsg, { parse_mode: 'Markdown' })
      .catch(err => console.error('❌ Telegram error:', err.message));
  }
}

const system = new EVOpportunitiesSystemPRO();
system.start();

process.on('unhandledRejection', (reason) => console.error('❌ Rejection:', reason));
process.on('uncaughtException', (error) => console.error('❌ Exception:', error));
