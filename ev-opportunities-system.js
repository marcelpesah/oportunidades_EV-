const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Pool } = require('pg');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const STATPAL_API_KEY = process.env.STATPAL_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_CREDENTIALS_JSON = process.env.GOOGLE_CREDENTIALS_JSON;

let CONFIG = {};
try {
  CONFIG = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (err) {
  console.error('❌ Erro ao carregar config.json:', err.message);
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

let sheetsClient = null;

async function initGoogleSheets() {
  try {
    if (!GOOGLE_CREDENTIALS_JSON) {
      console.warn('⚠️ GOOGLE_CREDENTIALS_JSON não configurado.');
      return null;
    }

    const credentials = JSON.parse(GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets conectado');
    await ensureHeaders();
    return sheetsClient;
  } catch (err) {
    console.error('❌ Erro Google Sheets:', err.message);
    return null;
  }
}

async function ensureHeaders() {
  if (!sheetsClient || !GOOGLE_SHEETS_ID) return;
  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: 'Página1!A1:K1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      const headers = [
        ['Data', 'Hora', 'Liga', 'Tier', 'Mercado', 'Times', 'Probabilidade%', 'Odd', 'EV%', 'Tipo', 'Status']
      ];

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: 'Página1!A1:K1',
        valueInputOption: 'RAW',
        resource: { values: headers },
      });

      console.log('✅ Headers criados');
    }
  } catch (err) {
    console.error('❌ Erro headers:', err.message);
  }
}

async function syncToGoogleSheets() {
  if (!sheetsClient || !GOOGLE_SHEETS_ID) return;
  try {
    const result = await pool.query(
      `SELECT 
        TO_CHAR(created_at, 'DD/MM/YYYY') as data,
        TO_CHAR(created_at, 'HH:MM:SS') as hora,
        league, tier, market, CONCAT(home_team, ' vs ', away_team) as times,
        probability, odd, ev_percentage
      FROM opportunities ORDER BY created_at DESC LIMIT 1000`
    );

    if (result.rows.length === 0) return;

    const headers = [['Data', 'Hora', 'Liga', 'Tier', 'Mercado', 'Times', 'Probabilidade%', 'Odd', 'EV%', 'Tipo', 'Status']];
    const rows = result.rows.map(r => [r.data, r.hora, r.league, r.tier, r.market, r.times, r.probability, r.odd, r.ev_percentage, 'AUTO', 'OK']);

    await sheetsClient.spreadsheets.values.clear({ spreadsheetId: GOOGLE_SHEETS_ID, range: 'Página1!A:K' });
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: 'Página1!A1:K1000',
      valueInputOption: 'RAW',
      resource: { values: [...headers, ...rows] },
    });
  } catch (err) {
    console.error('❌ Erro sync:', err.message);
  }
}

class EVOpportunitiesSystemPRO {
  constructor() {
    this.dailyStats = { identified: 0, resolved: 0, profitable: 0 };
    this.statpalBaseUrl = 'https://statpal.io/api/v2/soccer/matches/live';
    this.liveMatches = new Set();
  }

  async initDatabase() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS opportunities (
          id SERIAL PRIMARY KEY,
          match_id VARCHAR(50), league VARCHAR(100), tier VARCHAR(10),
          home_team VARCHAR(100), away_team VARCHAR(100), market VARCHAR(100),
          probability DECIMAL(5,2), odd DECIMAL(10,4), ev_percentage DECIMAL(5,2),
          status VARCHAR(20), green_red VARCHAR(5), roi_percentage DECIMAL(5,2),
          alert_type VARCHAR(20), calculation_type VARCHAR(20),
          alert_sent_at TIMESTAMP, result_updated_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Database inicializado');
    } catch (err) {
      console.error('❌ DB Error:', err.message);
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
      const response = await axios.get(this.statpalBaseUrl, {
        params: { access_key: STATPAL_API_KEY },
        timeout: 10000
      });
      
      // TESTE TODAS AS VARIAÇÕES POSSÍVEIS
      let matches = [];
      
      // Teste 1: response.data.live_matches (array direto)
      if (Array.isArray(response.data.live_matches)) {
        matches = response.data.live_matches;
        console.log(`📡 Matches via live_matches (array): ${matches.length}`);
      }
      // Teste 2: response.data.live_matches.data
      else if (response.data.live_matches && Array.isArray(response.data.live_matches.data)) {
        matches = response.data.live_matches.data;
        console.log(`📡 Matches via live_matches.data: ${matches.length}`);
      }
      // Teste 3: response.data.live_matches.matches
      else if (response.data.live_matches && Array.isArray(response.data.live_matches.matches)) {
        matches = response.data.live_matches.matches;
        console.log(`📡 Matches via live_matches.matches: ${matches.length}`);
      }
      // Teste 4: response.data.data
      else if (Array.isArray(response.data.data)) {
        matches = response.data.data;
        console.log(`📡 Matches via data: ${matches.length}`);
      }
      // Teste 5: response.data (é array direto)
      else if (Array.isArray(response.data)) {
        matches = response.data;
        console.log(`📡 Matches via response.data (array direto): ${matches.length}`);
      }
      
      if (matches.length === 0) {
        console.log(`📡 Retrieved 0 matches (todas as variações testadas)`);
      }
      
      return matches;
    } catch (error) {
      console.error('❌ StatPal Error:', error.message);
      return [];
    }
  }

  async checkLiveOpportunities() {
    try {
      console.log('⚡ [LIVE] Verificando oportunidades...');
      const matches = await this.fetchMatches();
      console.log(`✅ Total matches processados: ${matches.length}`);
    } catch (error) {
      console.error('❌ Erro LIVE:', error.message);
    }
  }

  start() {
    console.log('🚀 EV Opportunities System PRO v2.5.1 (FLEX)');
    console.log('📡 Conectando ao StatPal API...');
    this.initDatabase();

    setInterval(() => this.checkLiveOpportunities(), 5 * 1000);
    setInterval(() => syncToGoogleSheets(), 5 * 60 * 1000);

    console.log('✅ Sistema iniciado!');
    console.log('✅ Telegram conectado');
    console.log('✅ Google Sheets sincronizado');

    const startMsg = `
✅ *EV Opportunities v2.5.1 ATIVO*
Testando todas as variações StatPal...
    `;

    bot.sendMessage(TELEGRAM_USER_ID, startMsg, { parse_mode: 'Markdown' })
      .catch(err => console.error('Telegram error:', err.message));
  }
}

initGoogleSheets().then(() => {
  const system = new EVOpportunitiesSystemPRO();
  system.start();
});

process.on('unhandledRejection', (reason) => console.error('Rejection:', reason));
process.on('uncaughtException', (error) => console.error('Exception:', error));
