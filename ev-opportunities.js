const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

// Configurações
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const SPORTMONKS_API_KEY = process.env.SPORTMONKS_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const DEBUG = process.env.DEBUG === 'true';

// Pool de conexão PostgreSQL
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Inicializar bot Telegram
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// Ligas de interesse (TIER 1 e TIER 2)
const LEAGUES_OF_INTEREST = {
  // TIER 1
  '39': 'Premier League',
  '140': 'La Liga',
  '135': 'Serie A',
  '78': 'Bundesliga',
  '61': 'Ligue 1',
  '71': 'Série A Brasil',
  '238': 'Liga Portugal',
  '87': 'Eredivisie',
};

// Mercados de interesse
const MARKETS_OF_INTEREST = [
  'Over/Under Gols',
  'Handicap Asiático',
  'Over/Under Escanteios',
  'Over/Under Cartões'
];

// Limiar de EV
const MIN_EV_PERCENTAGE = 5;

class EVOpportunitiesSystem {
  constructor() {
    this.schedulers = {};
    this.opportunities = new Map();
    this.dailyStats = {
      identified: 0,
      resolved: 0,
      profitable: 0
    };
  }

  async initializeDatabase() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS opportunities (
          id SERIAL PRIMARY KEY,
          match_id VARCHAR(50),
          league VARCHAR(100),
          home_team VARCHAR(100),
          away_team VARCHAR(100),
          market VARCHAR(100),
          probability DECIMAL(5,2),
          odd DECIMAL(10,4),
          ev_percentage DECIMAL(5,2),
          prediction VARCHAR(100),
          status VARCHAR(20),
          alert_sent_time TIMESTAMP,
          result VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization error:', error.message);
    }
  }

  async fetchUpcomingMatches() {
    try {
      const response = await axios.get(
        'https://api.sportmonks.com/v3/fixtures',
        {
          params: {
            api_token: SPORTMONKS_API_KEY,
            'filters[season_id]': '21844', // 2024/2025 season
            'filters[status]': 'SCHEDULED',
            'filters[league_id]': Object.keys(LEAGUES_OF_INTEREST).join(','),
            'include': 'league,teams,statistics'
          }
        }
      );

      return response.data.data || [];
    } catch (error) {
      if (DEBUG) console.error('🔴 Sportmonks API error:', error.message);
      return [];
    }
  }

  calculateProbability(match, market) {
    try {
      const homeTeam = match.teams?.find(t => t.pivot?.role === 'home');
      const awayTeam = match.teams?.find(t => t.pivot?.role === 'away');

      if (!homeTeam || !awayTeam) return null;

      // Dados simulados baseado em xG e estatísticas
      const homeStats = match.statistics?.find(s => s.team_id === homeTeam.id) || {};
      const awayStats = match.statistics?.find(s => s.team_id === awayTeam.id) || {};

      const homeXG = parseFloat(homeStats.xg) || 1.2;
      const awayXG = parseFloat(awayStats.xg) || 0.8;

      let probability = 0.5;

      // Cálculo de probabilidade por mercado
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

      return Math.min(0.95, Math.max(0.05, probability));
    } catch (error) {
      return null;
    }
  }

  generateOdds(probability) {
    // Odds geradas com pequeno house edge (5%)
    const fairOdd = 1 / probability;
    return parseFloat((fairOdd * 0.95).toFixed(2));
  }

  calculateEV(probability, odd) {
    return (probability * odd - 1) * 100;
  }

  async checkPreLiveOpportunities() {
    try {
      console.log('🔍 Checking PRÉ-LIVE opportunities...');

      const matches = await this.fetchUpcomingMatches();

      for (const match of matches) {
        const leagueName = LEAGUES_OF_INTEREST[match.league_id];
        if (!leagueName) continue;

        const kickoffTime = new Date(match.starting_at);
        const minutesUntilKickoff = (kickoffTime - new Date()) / (1000 * 60);

        // Verificar alertas em -60min e -30min
        if ((minutesUntilKickoff > 59 && minutesUntilKickoff < 61) ||
            (minutesUntilKickoff > 29 && minutesUntilKickoff < 31)) {

          for (const market of MARKETS_OF_INTEREST) {
            const probability = this.calculateProbability(match, market);
            if (!probability) continue;

            const odd = this.generateOdds(probability);
            const ev = this.calculateEV(probability, odd);

            if (ev >= MIN_EV_PERCENTAGE) {
              const homeTeam = match.teams?.find(t => t.pivot?.role === 'home')?.name;
              const awayTeam = match.teams?.find(t => t.pivot?.role === 'away')?.name;

              const opportunity = {
                match_id: match.id,
                league: leagueName,
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
      console.error('❌ Error checking PRÉ-LIVE opportunities:', error.message);
    }
  }

  async sendAlert(opportunity, type) {
    try {
      const message = `
🎯 *OPORTUNIDADE EV+* ${type}

⚽ *${opportunity.league}*
🏠 ${opportunity.home_team} vs ${opportunity.away_team}
📊 Mercado: ${opportunity.market}
📈 Probabilidade: ${opportunity.probability}%
💰 Odd: ${opportunity.odd}
✅ EV: *${opportunity.ev_percentage}%*
⏱️ Tempo: ${opportunity.time_until_kickoff} min antes do jogo
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
      console.log(`✅ Alert sent: ${opportunity.league} - ${opportunity.market}`);

      // Salvar no banco
      await pool.query(
        `INSERT INTO opportunities 
         (match_id, league, home_team, away_team, market, probability, odd, ev_percentage, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          opportunity.match_id,
          opportunity.league,
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

  async sendDailySummary() {
    try {
      const stats = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'PROFITABLE' THEN 1 ELSE 0 END) as profitable,
           AVG(ev_percentage) as avg_ev
         FROM opportunities 
         WHERE DATE(created_at) = CURRENT_DATE`
      );

      const row = stats.rows[0];
      const message = `
📊 *RESUMO DIÁRIO - ${new Date().toLocaleDateString('pt-BR')}*

📈 Oportunidades identificadas: ${row.total}
✅ Oportunidades lucrativas: ${row.profitable || 0}
💹 EV médio: ${(row.avg_ev || 0).toFixed(2)}%
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
      console.log('✅ Daily summary sent');
    } catch (error) {
      console.error('❌ Error sending daily summary:', error.message);
    }
  }

  startSchedulers() {
    console.log('🚀 Starting schedulers...');

    // Verificar PRÉ-LIVE a cada 5 minutos
    this.schedulers.preLive = setInterval(() => {
      this.checkPreLiveOpportunities();
    }, 5 * 60 * 1000);

    // Resumo diário à meia-noite
    this.schedulers.dailySummary = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 23 && now.getMinutes() === 59) {
        this.sendDailySummary();
      }
    }, 60 * 1000);

    console.log('✅ Schedulers started');
  }

  async start() {
    try {
      console.log('🚀 EV Opportunities System - REAL API VERSION');
      console.log('📡 Connecting to Sportmonks API...');

      await this.initializeDatabase();
      await this.startSchedulers();

      // Telegram bot conectado
      console.log('✅ Telegram bot connected');
      console.log('✅ System running. Waiting for opportunities...');

      const startMessage = `
✅ *Sistema de Oportunidades EV+ ATIVO*

📊 Conectado ao Sportmonks API (REAL)
🎯 Monitorando PRÉ-LIVE a cada 5 min
⚽ Ligas: Premier, La Liga, Serie A, Bundesliga, Ligue 1, Série A Brasil, Liga Portugal, Eredivisie
💰 Limite EV mínimo: 5%

Sistema pronto para identificar oportunidades! 🚀
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, startMessage, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('❌ Critical error:', error.message);
    }
  }
}

// Inicializar sistema
const system = new EVOpportunitiesSystem();
system.start();

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});
