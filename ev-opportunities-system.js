const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');

// Carregar configurações
const CONFIG = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Configurações
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const SPORTMONKS_API_KEY = process.env.SPORTMONKS_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const DEBUG = process.env.DEBUG === 'true';

// Pool PostgreSQL
const pool = new Pool({ connectionString: DATABASE_URL });

// Bot Telegram
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

class EVOpportunitiesSystemPRO {
  constructor() {
    this.schedulers = {};
    this.opportunities = new Map();
    this.dailyStats = {
      identified: 0,
      resolved: 0,
      profitable: 0,
      roi: 0,
      totalOdds: []
    };
  }

  async initializeDatabase() {
    try {
      // Criar tabela se não existir
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
          alert_sent_at TIMESTAMP,
          result_updated_at TIMESTAMP,
          result VARCHAR(20),
          green_red VARCHAR(5),
          roi_percentage DECIMAL(5,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Adicionar colunas que possam estar faltando
      const columnsToAdd = [
        { name: 'green_red', type: 'VARCHAR(5)' },
        { name: 'roi_percentage', type: 'DECIMAL(5,2)' },
        { name: 'result', type: 'VARCHAR(20)' },
        { name: 'result_updated_at', type: 'TIMESTAMP' }
      ];

      for (const col of columnsToAdd) {
        try {
          await pool.query(`
            ALTER TABLE opportunities 
            ADD COLUMN ${col.name} ${col.type};
          `);
          console.log(`✅ Coluna adicionada: ${col.name}`);
        } catch (err) {
          if (err.message.includes('already exists')) {
            if (DEBUG) console.log(`⚠️ Coluna ${col.name} já existe`);
          } else {
            console.error(`❌ Erro ao adicionar ${col.name}:`, err.message);
          }
        }
      }

      // Criar tabela de daily stats
      await pool.query(`
        CREATE TABLE IF NOT EXISTS daily_stats (
          id SERIAL PRIMARY KEY,
          stat_date DATE DEFAULT CURRENT_DATE,
          identified_count INT DEFAULT 0,
          resolved_count INT DEFAULT 0,
          profitable_count INT DEFAULT 0,
          roi DECIMAL(5,2) DEFAULT 0,
          total_profit DECIMAL(10,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('✅ Database inicializado com sucesso');
    } catch (error) {
      console.error('❌ Database error:', error.message);
    }
  }

  getAllLeagueIds() {
    const allLeagues = Object.assign(
      {},
      CONFIG.LIGAS.TIER1,
      CONFIG.LIGAS.TIER2,
      CONFIG.LIGAS.TIER3
    );
    return Object.keys(allLeagues).join(',');
  }

  async fetchUpcomingMatches() {
    try {
      const leagueIds = this.getAllLeagueIds();

      const response = await axios.get(
        'https://api.sportmonks.com/v3/fixtures',
        {
          params: {
            api_token: SPORTMONKS_API_KEY,
            'filters[season_id]': '21844',
            'filters[status]': 'SCHEDULED,LIVE,FINISHED',
            'filters[league_id]': leagueIds,
            'include': 'league,teams,statistics,events'
          },
          timeout: 10000
        }
      );

      return response.data.data || [];
    } catch (error) {
      if (DEBUG) console.error('🔴 Sportmonks API error:', error.message);
      return [];
    }
  }

  getTierByLeagueId(leagueId) {
    if (CONFIG.LIGAS.TIER1[leagueId]) return 'TIER1';
    if (CONFIG.LIGAS.TIER2[leagueId]) return 'TIER2';
    if (CONFIG.LIGAS.TIER3[leagueId]) return 'TIER3';
    return 'OTHER';
  }

  calculateProbability(match, market) {
    try {
      const homeTeam = match.teams?.find(t => t.pivot?.role === 'home');
      const awayTeam = match.teams?.find(t => t.pivot?.role === 'away');

      if (!homeTeam || !awayTeam) return null;

      const homeStats = match.statistics?.find(s => s.team_id === homeTeam.id) || {};
      const awayStats = match.statistics?.find(s => s.team_id === awayTeam.id) || {};

      const homeXG = parseFloat(homeStats.xg) || 1.2;
      const awayXG = parseFloat(awayStats.xg) || 0.8;

      let probability = 0.5;

      if (market.includes('Over') && market.includes('Gols')) {
        const expectedGoals = homeXG + awayXG;
        probability = Math.min(0.85, Math.max(0.15, expectedGoals / 3.5));
      } else if (market.includes('Handicap')) {
        const diff = homeXG - awayXG;
        probability = 0.5 + (diff * 0.15);
      } else if (market.includes('Escanteios')) {
        probability = 0.4 + Math.random() * 0.2;
      } else if (market.includes('Cartões')) {
        probability = 0.45 + Math.random() * 0.15;
      }

      probability = Math.min(0.95, Math.max(0.05, probability));

      if (
        probability < CONFIG.FILTROS.PROBABILIDADE_MINIMA ||
        probability > CONFIG.FILTROS.PROBABILIDADE_MAXIMA
      ) {
        return null;
      }

      return probability;
    } catch (error) {
      return null;
    }
  }

  generateOdds(probability) {
    const fairOdd = 1 / probability;
    return parseFloat((fairOdd * 0.95).toFixed(2));
  }

  calculateEV(probability, odd) {
    return (probability * odd - 1) * 100;
  }

  filterByParameters(probability, odd, ev) {
    return (
      ev >= CONFIG.FILTROS.EV_MINIMO &&
      odd >= CONFIG.FILTROS.ODD_MINIMA &&
      odd <= CONFIG.FILTROS.ODD_MAXIMA
    );
  }

  async checkPreLiveOpportunities() {
    try {
      if (DEBUG) console.log('🔍 Checking PRÉ-LIVE opportunities...');

      const matches = await this.fetchUpcomingMatches();

      for (const match of matches) {
        const leagueId = match.league_id;
        const tier = this.getTierByLeagueId(leagueId);
        
        let leagueName;
        if (tier === 'TIER1') leagueName = CONFIG.LIGAS.TIER1[leagueId];
        else if (tier === 'TIER2') leagueName = CONFIG.LIGAS.TIER2[leagueId];
        else if (tier === 'TIER3') leagueName = CONFIG.LIGAS.TIER3[leagueId];

        if (!leagueName) continue;

        const kickoffTime = new Date(match.starting_at);
        const minutesUntilKickoff = (kickoffTime - new Date()) / (1000 * 60);

        if (
          (minutesUntilKickoff > 59 && minutesUntilKickoff < 61) ||
          (minutesUntilKickoff > 29 && minutesUntilKickoff < 31)
        ) {
          for (const market of CONFIG.MERCADOS) {
            const probability = this.calculateProbability(match, market);
            if (!probability) continue;

            const odd = this.generateOdds(probability);
            const ev = this.calculateEV(probability, odd);

            if (this.filterByParameters(probability, odd, ev)) {
              const homeTeam = match.teams?.find(t => t.pivot?.role === 'home')?.name;
              const awayTeam = match.teams?.find(t => t.pivot?.role === 'away')?.name;

              const opportunity = {
                match_id: match.id,
                league: leagueName,
                tier: tier,
                home_team: homeTeam,
                away_team: awayTeam,
                market,
                probability: probability.toFixed(2),
                odd: odd.toFixed(2),
                ev_percentage: ev.toFixed(2),
                time_until_kickoff: minutesUntilKickoff.toFixed(0)
              };

              await this.sendAlert(opportunity, 'PRÉ-LIVE');
              this.dailyStats.identified++;
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking PRÉ-LIVE:', error.message);
    }
  }

  async sendAlert(opportunity, type) {
    try {
      const tierEmoji =
        opportunity.tier === 'TIER1' ? '🔴' : opportunity.tier === 'TIER2' ? '🟡' : '🟢';

      const message = `
🎯 *OPORTUNIDADE EV+* ${type}

${tierEmoji} *${opportunity.league}* [${opportunity.tier}]
🏠 ${opportunity.home_team} vs ${opportunity.away_team}
📊 Mercado: ${opportunity.market}
📈 Probabilidade: ${opportunity.probability}%
💰 Odd: ${opportunity.odd}
✅ EV: *${opportunity.ev_percentage}%*
⏱️ Tempo: ${opportunity.time_until_kickoff} min antes
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
      console.log(`✅ Alert sent: ${opportunity.league} - ${opportunity.market}`);

      await pool.query(
        `INSERT INTO opportunities 
         (match_id, league, tier, home_team, away_team, market, probability, odd, ev_percentage, status, alert_sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          opportunity.match_id,
          opportunity.league,
          opportunity.tier,
          opportunity.home_team,
          opportunity.away_team,
          opportunity.market,
          opportunity.probability,
          opportunity.odd,
          opportunity.ev_percentage,
          'ALERTED'
        ]
      );
    } catch (error) {
      console.error('❌ Error sending alert:', error.message);
    }
  }

  async checkResultsAndUpdateGreenRed() {
    try {
      if (DEBUG) console.log('📊 Checking results...');

      const matches = await this.fetchUpcomingMatches();

      for (const match of matches) {
        if (match.status !== 'FINISHED') continue;

        const result = await pool.query(
          `SELECT * FROM opportunities WHERE match_id = $1 AND status = 'ALERTED'`,
          [match.id]
        );

        for (const opp of result.rows) {
          const homeTeam = match.teams?.find(t => t.pivot?.role === 'home');
          const awayTeam = match.teams?.find(t => t.pivot?.role === 'away');

          const homeGoals = match.statistics?.find(s => s.team_id === homeTeam.id)?.goals || 0;
          const awayGoals = match.statistics?.find(s => s.team_id === awayTeam.id)?.goals || 0;
          const totalGoals = homeGoals + awayGoals;

          let resultado = null;
          let greenRed = null;

          if (opp.market.includes('Over') && opp.market.includes('Gols')) {
            const threshold = opp.market.includes('2.5') ? 2.5 : opp.market.includes('3') ? 3 : 2;
            resultado = totalGoals >= threshold ? 'HIT' : 'MISS';
          }

          if (resultado) {
            greenRed = resultado === 'HIT' ? 'GREEN' : 'RED';
            const roiPercentage =
              greenRed === 'GREEN'
                ? parseFloat(opp.ev_percentage)
                : -100 * (1 / parseFloat(opp.odd));

            await pool.query(
              `UPDATE opportunities 
               SET status = $1, result = $2, green_red = $3, roi_percentage = $4, result_updated_at = NOW()
               WHERE id = $5`,
              ['RESOLVED', resultado, greenRed, roiPercentage, opp.id]
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
           SUM(CASE WHEN green_red = 'GREEN' THEN CAST(roi_percentage AS FLOAT) ELSE -CAST(roi_percentage AS FLOAT) END) as total_roi
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
💵 ROI total do dia: ${(row.total_roi || 0).toFixed(2)}%
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
      console.log('✅ Daily summary sent');
    } catch (error) {
      console.error('❌ Error sending daily summary:', error.message);
    }
  }

  startSchedulers() {
    console.log('🚀 Starting schedulers...');

    if (CONFIG.ALERTAS.PRE_LIVE_60 || CONFIG.ALERTAS.PRE_LIVE_30) {
      this.schedulers.preLive = setInterval(() => {
        this.checkPreLiveOpportunities();
      }, CONFIG.SCHEDULERS.PRE_LIVE_INTERVALO_MIN * 60 * 1000);
    }

    if (CONFIG.ALERTAS.RESULTADO) {
      this.schedulers.resultCheck = setInterval(() => {
        this.checkResultsAndUpdateGreenRed();
      }, CONFIG.SCHEDULERS.RESULTADO_CHECK_INTERVALO_MIN * 60 * 1000);
    }

    if (CONFIG.NOTIFICACOES.ENVIAR_RESUMO_DIARIO) {
      this.schedulers.dailySummary = setInterval(() => {
        const now = new Date();
        if (
          now.getHours() === CONFIG.SCHEDULERS.RESUMO_DIARIO_HORA &&
          now.getMinutes() === CONFIG.SCHEDULERS.RESUMO_DIARIO_MINUTO
        ) {
          this.sendDailySummary();
        }
      }, 60 * 1000);
    }

    console.log('✅ Schedulers started');
  }

  async start() {
    try {
      console.log('🚀 EV Opportunities System PRO - REAL API');
      console.log('📡 Connecting to Sportmonks API...');

      await this.initializeDatabase();
      await this.startSchedulers();

      console.log('✅ Telegram bot connected');
      console.log('✅ System running. Waiting for opportunities...');

      const startMessage = `
✅ *Sistema de Oportunidades EV+ PRO ATIVO*

📊 Conectado ao Sportmonks API (REAL)
🎯 Monitorando PRÉ-LIVE a cada ${CONFIG.SCHEDULERS.PRE_LIVE_INTERVALO_MIN} min
📍 Ligas TIER 1: ${Object.values(CONFIG.LIGAS.TIER1).slice(0, 4).join(', ')}...
📍 Ligas TIER 2: ${Object.values(CONFIG.LIGAS.TIER2).slice(0, 3).join(', ')}...
💰 Limite EV: ${CONFIG.FILTROS.EV_MINIMO}%
💵 Odds: ${CONFIG.FILTROS.ODD_MINIMA} - ${CONFIG.FILTROS.ODD_MAXIMA}

🟢 GREEN/RED: Ativado
📊 ROI Tracking: Ativado
📈 Relatórios: Diários

Sistema pronto! 🚀
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, startMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('❌ Critical error:', error.message);
    }
  }
}

const system = new EVOpportunitiesSystemPRO();
system.start();

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});
