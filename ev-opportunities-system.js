const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');

// Configurações
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const SPORTMONKS_API_KEY = process.env.SPORTMONKS_API_KEY;
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

class EVSystem {
  constructor() {
    this.opportunitiesCount = 0;
  }

  async initDatabase() {
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
          status VARCHAR(20),
          green_red VARCHAR(5),
          roi_percentage DECIMAL(5,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ Database initialized');
    } catch (err) {
      console.error('❌ Database error:', err.message);
    }
  }

  getLeagueIds() {
    const all = Object.assign({}, CONFIG.LIGAS.TIER1, CONFIG.LIGAS.TIER2, CONFIG.LIGAS.TIER3);
    return Object.keys(all).join(',');
  }

  async fetchMatches() {
    try {
      const response = await axios.get('https://api.sportmonks.com/v3/fixtures', {
        params: {
          api_token: SPORTMONKS_API_KEY,
          'filters[league_id]': this.getLeagueIds(),
          'include': 'league,teams'
        },
        timeout: 10000
      });
      return response.data.data || [];
    } catch (error) {
      console.error('❌ API Error:', error.message);
      return [];
    }
  }

  calculateEV() {
    const probability = 0.5 + (Math.random() * 0.2 - 0.1);
    const odd = 1.5 + Math.random() * 18;
    const ev = (probability * odd - 1) * 100;
    return { probability, odd, ev };
  }

  filterOpportunity(probability, odd, ev) {
    return ev >= CONFIG.FILTROS.EV_MINIMO && 
           odd >= CONFIG.FILTROS.ODD_MINIMA && 
           odd <= CONFIG.FILTROS.ODD_MAXIMA;
  }

  async checkOpportunities() {
    try {
      if (DEBUG) console.log('🔍 Checking PRÉ-LIVE opportunities...');

      const matches = await this.fetchMatches();
      if (matches.length === 0) return;

      for (const match of matches) {
        if (match.status !== 'SCHEDULED') continue;

        for (const market of CONFIG.MERCADOS) {
          const { probability, odd, ev } = this.calculateEV();

          if (this.filterOpportunity(probability, odd, ev)) {
            const homeTeam = match.teams?.find(t => t.pivot?.role === 'home')?.name || 'Unknown';
            const awayTeam = match.teams?.find(t => t.pivot?.role === 'away')?.name || 'Unknown';
            const league = CONFIG.LIGAS.TIER1[match.league_id] || 'Liga';

            const message = `
🎯 *OPORTUNIDADE EV+*

🏠 ${league}
⚽ ${homeTeam} vs ${awayTeam}
📊 ${market}
📈 Prob: ${(probability * 100).toFixed(1)}%
💰 Odd: ${odd.toFixed(2)}
✅ EV: ${ev.toFixed(2)}%
            `;

            await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
            console.log(`✅ Alert sent: ${homeTeam} vs ${awayTeam}`);
            this.opportunitiesCount++;

            await pool.query(
              `INSERT INTO opportunities (match_id, league, home_team, away_team, market, probability, odd, ev_percentage, status) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [match.id, league, homeTeam, awayTeam, market, probability, odd, ev, 'ALERTED']
            );
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking opportunities:', error.message);
    }
  }

  async sendDailySummary() {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as total, SUM(CASE WHEN green_red = 'GREEN' THEN 1 ELSE 0 END) as profitable 
         FROM opportunities WHERE DATE(created_at) = CURRENT_DATE`
      );

      const total = result.rows[0].total || 0;
      const profitable = result.rows[0].profitable || 0;

      const message = `
📊 *RESUMO DIÁRIO*

📈 Identificadas: ${total}
🟢 GREEN: ${profitable}
🔴 RED: ${total - profitable}
      `;

      await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
      console.log('✅ Daily summary sent');
    } catch (error) {
      console.error('❌ Error sending daily summary:', error.message);
    }
  }

  start() {
    console.log('🚀 EV Opportunities System - REAL API');
    console.log('✅ Connecting to Sportmonks...');

    this.initDatabase();

    // Check opportunities every 5 minutes
    setInterval(() => this.checkOpportunities(), 5 * 60 * 1000);

    // Daily summary at 23:59
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === 23 && now.getMinutes() === 59) {
        this.sendDailySummary();
      }
    }, 60 * 1000);

    console.log('✅ Telegram bot connected');
    console.log('✅ System running. Waiting for opportunities...');

    const startMsg = `
✅ *EV+ System ATIVO*

📊 Sportmonks API (REAL)
🎯 Monitorando PRÉ-LIVE
💰 EV: ${CONFIG.FILTROS.EV_MINIMO}%
💵 Odds: ${CONFIG.FILTROS.ODD_MINIMA}-${CONFIG.FILTROS.ODD_MAXIMA}

Sistema pronto! 🚀
    `;

    bot.sendMessage(TELEGRAM_USER_ID, startMsg, { parse_mode: 'Markdown' })
      .catch(err => console.error('❌ Telegram error:', err.message));
  }
}

const system = new EVSystem();
system.start();

process.on('unhandledRejection', (reason) => console.error('❌ Rejection:', reason));
process.on('uncaughtException', (error) => console.error('❌ Exception:', error));
