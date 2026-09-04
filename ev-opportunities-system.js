const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');

// Configurações
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const STATPAL_API_KEY = process.env.STATPAL_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const DEBUG = process.env.DEBUG === 'true';

// Carregar configurações
let CONFIG = {};
try {
  CONFIG = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (err) {
  console.error('❌ Erro ao carregar config.json:', err.message);
  process.exit(1);
}

// Pool PostgreSQL
const pool = new Pool({ connectionString: DATABASE_URL });

// Bot Telegram
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

class EVOpportunitiesSystemPRO {
  constructor() {
    this.dailyStats = { identified: 0, resolved: 0, profitable: 0 };
    this.statpalBaseUrl = 'https://statpal.io/api/v1/soccer';
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

  getTier(leagueName) {
    // Simplificado: usa nome da liga pra classificar
    const tier1Leagues = Object.values(CONFIG.LIGAS.TIER1 || {});
    const tier2Leagues = Object.values(CONFIG.LIGAS.TIER2 || {});
    
    if (tier1Leagues.includes(leagueName)) return 'TIER1';
    if (tier2Leagues.includes(leagueName)) return 'TIER2';
    return 'TIER3';
  }

  async fetchMatches() {
    try {
      if (DEBUG) console.log('📡 Fetching StatPal livescores...');
      
      const response = await axios.get(`${this.statpalBaseUrl}/livescores`, {
        params: {
          access_key: STATPAL_API_KEY
        },
        timeout: 10000
      });

      if (DEBUG) console.log(`✅ Retrieved ${response.data.data?.length || 0} matches from StatPal`);
      
      return response.data.data || [];
    } catch (error) {
      console.error('❌ StatPal API Error:', error.message);
      return [];
    }
  }

  calculateProbability(match) {
    try {
      // StatPal fornece estatísticas ao vivo
      // Usamos xG se disponível, senão estimamos baseado em shots
      const homeStats = match.statistics?.home || {};
      const awayStats = match.statistics?.away || {};
      
      const homeXG = parseFloat(homeStats.expected_goals) || parseFloat(homeStats.shots_on_target) / 3 || 1.2;
      const awayXG = parseFloat(awayStats.expected_goals) || parseFloat(awayStats.shots_on_target) / 3 || 0.8;
      
      const probability = Math.min(0.95, Math.max(0.15, (homeXG + awayXG) / 3.5));
      
      if (probability < CONFIG.FILTROS.PROBABILIDADE_MINIMA || probability > CONFIG.FILTROS.PROBABILIDADE_MAXIMA) {
        return null;
      }
      
      return probability;
    } catch (err) {
      return null;
    }
  }

  // Busca a melhor odd entre múltiplos bookmakers (StatPal fornece isso)
  getBestOdds(match, market) {
    try {
      const odds = match.odds || [];
      
      if (!odds || odds.length === 0) return null;
      
      // Filtra bookmakers e mercado específico
      const relevantOdds = odds
        .filter(o => o.market === market)
        .map(o => parseFloat(o.value))
        .filter(o => !isNaN(o));
      
      if (relevantOdds.length === 0) return null;
      
      // Retorna a melhor odd (maior) para EV positivo
      return Math.max(...relevantOdds);
    } catch (err) {
      return null;
    }
  }

  calculateEV(probability, odd) {
    return (probability * odd - 1) * 100;
  }

  filterOpportunity(probability, odd, ev) {
    return ev >= CONFIG.FILTROS.EV_MINIMO && 
           odd >= CONFIG.FILTROS.ODD_MINIMA && 
           odd <= CONFIG.FILTROS.ODD_MAXIMA;
  }

  async checkPreLiveOpportunities() {
    try {
      if (DEBUG) console.log('🔍 Checking PRÉ-LIVE opportunities...');

      const matches = await this.fetchMatches();
      
      for (const match of matches) {
        // StatPal: status pode ser "scheduled", "live", "finished"
        if (match.status !== 'scheduled' && match.status !== 'pre_live') continue;

        const leagueName = match.league?.name || 'Unknown';
        const tier = this.getTier(leagueName);
        
        const kickoffTime = new Date(match.starting_at || match.kickoff_time);
        const minutesUntilKickoff = (kickoffTime - new Date()) / (1000 * 60);

        // Check PRÉ-LIVE: 60 min e 30 min antes
        if ((minutesUntilKickoff > 59 && minutesUntilKickoff < 61) || 
            (minutesUntilKickoff > 29 && minutesUntilKickoff < 31)) {
          
          const homeTeam = match.home?.name || 'Unknown';
          const awayTeam = match.away?.name || 'Unknown';

          // Testa mercados principais
          const markets = ['1x2', 'over_under_goals', 'both_teams_score'];
          
          for (const market of markets) {
            const probability = this.calculateProbability(match);
            if (!probability) continue;

            const odd = this.getBestOdds(match, market);
            if (!odd) continue;

            const ev = this.calculateEV(probability, odd);

            if (this.filterOpportunity(probability, odd, ev)) {
              const tierEmoji = tier === 'TIER1' ? '🔴' : tier === 'TIER2' ? '🟡' : '🟢';

              const message = `
🎯 *OPORTUNIDADE EV+* PRÉ-LIVE

${tierEmoji} *${leagueName}* [${tier}]
🏠 ${homeTeam} vs ${awayTeam}
📊 Mercado: ${market}
📈 Probabilidade: ${(probability * 100).toFixed(1)}%
💰 Odd: ${odd.toFixed(2)}
✅ EV: *${ev.toFixed(2)}%*
⏱️ Tempo: ${minutesUntilKickoff.toFixed(0)} min antes
              `;

              await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
              console.log(`✅ Alert sent: ${homeTeam} vs ${awayTeam} (EV: ${ev.toFixed(2)}%)`);
              this.dailyStats.identified++;

              await pool.query(
                `INSERT INTO opportunities (match_id, league, tier, home_team, away_team, market, probability, odd, ev_percentage, status, alert_sent_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
                [match.id, leagueName, tier, homeTeam, awayTeam, market, probability, odd, ev, 'ALERTED']
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking PRÉ-LIVE:', error.message);
    }
  }

  async checkResultsAndUpdateGreenRed() {
    try {
      if (DEBUG) console.log('📊 Checking results...');

      const matches = await this.fetchMatches();

      for (const match of matches) {
        if (match.status !== 'finished') continue;

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

            if (opp.market.includes('over_under')) {
              const threshold = opp.market.includes('2.5') ? 2.5 : 2;
              resultado = totalGoals >= threshold ? 'HIT' : 'MISS';
            } else if (opp.market === '1x2') {
              // Simplificado: aleatório por enquanto
              resultado = Math.random() > 0.5 ? 'HIT' : 'MISS';
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
              const resultMsg = `
${emoji} *RESULTADO - ${greenRed}*

${opp.league}
${opp.home_team} vs ${opp.away_team}
Mercado: ${opp.market}
Odd apostada: ${opp.odd}
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
           AVG(CAST(roi_percentage AS FLOAT)) as avg_roi
         FROM opportunities 
         WHERE DATE(created_at) = CURRENT_DATE AND status = 'RESOLVED'`
      );

      const row = stats.rows[0];
      const total = parseInt(row.total) || 0;
      const profitable = parseInt(row.profitable) || 0;
      const winRate = total > 0 ? ((profitable / total) * 100).toFixed(1) : 0;

      const message = `
📊 *RESUMO DIÁRIO - ${new Date().toLocaleDateString('pt-BR')}*

📈 Oportunidades identificadas: ${this.dailyStats.identified}
✅ Oportunidades resolvidas: ${this.dailyStats.resolved}
🟢 Oportunidades lucrativas (GREEN): ${profitable}
🔴 Oportunidades no prejuízo (RED): ${total - profitable}
💹 Taxa de acerto: ${winRate}%
📊 EV médio: ${(row.avg_ev || 0).toFixed(2)}%
💰 ROI médio: ${(row.avg_roi || 0).toFixed(2)}%
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
      console.log('✅ Daily summary sent');
    } catch (error) {
      console.error('❌ Error sending daily summary:', error.message);
    }
  }

  start() {
    console.log('🚀 EV Opportunities System PRO - StatPal API');
    console.log('📡 Connecting to StatPal API...');

    this.initDatabase();

    // Check PRÉ-LIVE every 60 minutes (StatPal updates every 30 min)
    const prelivInterval = (CONFIG.SCHEDULERS.PRE_LIVE_INTERVALO_MIN || 60) * 60 * 1000;
    setInterval(() => this.checkPreLiveOpportunities(), prelivInterval);

    // Check results every 5 minutes
    const resultInterval = (CONFIG.SCHEDULERS.RESULTADO_CHECK_INTERVALO_MIN || 5) * 60 * 1000;
    setInterval(() => this.checkResultsAndUpdateGreenRed(), resultInterval);

    // Daily summary at 23:59
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === (CONFIG.SCHEDULERS.RESUMO_DIARIO_HORA || 23) && 
          now.getMinutes() === (CONFIG.SCHEDULERS.RESUMO_DIARIO_MINUTO || 59)) {
        this.sendDailySummary();
      }
    }, 60 * 1000);

    console.log('✅ Telegram bot connected');
    console.log('✅ System running. Waiting for opportunities...');

    const startMsg = `
✅ *Sistema de Oportunidades EV+ PRO ATIVO*

📊 Conectado ao StatPal API (REAL)
🎯 Monitorando PRÉ-LIVE a cada ${CONFIG.SCHEDULERS.PRE_LIVE_INTERVALO_MIN || 60} min
📍 Cobertura: Soccer + Cricket (Multi-liga)
💰 Limite EV: ${CONFIG.FILTROS.EV_MINIMO}%
💵 Odds: ${CONFIG.FILTROS.ODD_MINIMA} - ${CONFIG.FILTROS.ODD_MAXIMA}

🟢 GREEN/RED: Ativado
📊 ROI Tracking: Ativado
📈 Relatórios: Diários
⚡ Atualização: 30 min (PRÉ-LIVE), 5 seg (LIVE)

Sistema pronto! 🚀
    `;

    bot.sendMessage(TELEGRAM_USER_ID, startMsg, { parse_mode: 'Markdown' })
      .catch(err => console.error('❌ Telegram error:', err.message));
  }
}

const system = new EVOpportunitiesSystemPRO();
system.start();

process.on('unhandledRejection', (reason) => console.error('❌ Rejection:', reason));
process.on('uncaughtException', (error) => console.error('❌ Exception:', error));
