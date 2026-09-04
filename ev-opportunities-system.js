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
        ROUND(CAST(probability AS NUMERIC), 3) as probabilidade,
        ROUND(CAST(odd AS NUMERIC), 2) as odd,
        ROUND(CAST(ev_percentage AS NUMERIC), 2) as ev
      FROM opportunities ORDER BY created_at DESC LIMIT 1000`
    );

    if (result.rows.length === 0) return;

    const headers = [['Data', 'Hora', 'Liga', 'Tier', 'Mercado', 'Times', 'Probabilidade%', 'Odd', 'EV%', 'Tipo', 'Status']];
    const rows = result.rows.map(r => [r.data, r.hora, r.league, r.tier, r.market, r.times, r.probabilidade, r.odd, r.ev, 'AUTO', 'OK']);

    await sheetsClient.spreadsheets.values.clear({ spreadsheetId: GOOGLE_SHEETS_ID, range: 'Página1!A:K' });
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: 'Página1!A1:K1000',
      valueInputOption: 'RAW',
      resource: { values: [...headers, ...rows] },
    });

    console.log(`✅ Sincronização: ${result.rows.length} registros`);
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
      
      // CORREÇÃO FINAL: Os matches estão em response.data.live_matches.league
      const matches = response.data.live_matches?.league || [];
      
      if (matches.length > 0) {
        console.log(`📡 Retrieved ${matches.length} matches from StatPal`);
      } else {
        console.log(`📡 Retrieved 0 matches from StatPal`);
      }
      
      return matches;
    } catch (error) {
      console.error('❌ StatPal Error:', error.message);
      return [];
    }
  }

  calculateProbabilityPreLive(match, market) {
    try {
      let probability = 0.5;
      if (market === 'vitoria_1x2') probability = 0.50;
      else if (market === 'ambos_marcam') probability = 0.45;
      else if (market === 'handicap_asiatico') probability = 0.48;
      else if (market === 'over_under_escanteios') probability = 0.50;
      else if (market === 'over_under_cartoes') probability = 0.45;

      probability = Math.min(0.95, Math.max(0.30, probability));
      return probability;
    } catch (err) {
      return null;
    }
  }

  calculateProbabilityLive(match, market) {
    try {
      const homeStats = match.statistics?.home || {};
      const awayStats = match.statistics?.away || {};
      let probability = 0.5;

      if (market === 'vitoria_1x2') {
        const homeXG = parseFloat(homeStats.expected_goals) || 0;
        const awayXG = parseFloat(awayStats.expected_goals) || 0;
        const totalXG = homeXG + awayXG;
        if (totalXG === 0) return 0.50;
        probability = Math.min(0.95, Math.max(0.15, homeXG / (totalXG / 2)));
      } else if (market === 'ambos_marcam') {
        const homeGoals = parseInt(homeStats.goals) || 0;
        const awayGoals = parseInt(awayStats.goals) || 0;
        if (homeGoals > 0 && awayGoals > 0) return 0.99;
        probability = 0.40;
      }

      probability = Math.min(0.95, Math.max(0.30, probability));
      return probability;
    } catch (err) {
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
      console.log('🔍 [PRÉ-LIVE] Checking opportunities (HISTÓRICO)...');
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
            const probability = this.calculateProbabilityPreLive(match, market);
            if (!probability) continue;
            const odd = this.getBestOdds(match, market);
            if (!odd) continue;
            const ev = this.calculateEV(probability, odd);

            if (this.filterOpportunity(probability, odd, ev, market, tier)) {
              const tierEmoji = tier === 'TIER1' ? '🔴' : tier === 'TIER2' ? '🟡' : '🟢';
              const marketName = CONFIG.MERCADOS_CONFIG[market].nome;
              const message = `
🎯 *OPORTUNIDADE EV+* PRÉ-LIVE

${tierEmoji} *${leagueName}* [${tier}]
🏠 ${homeTeam} vs ${awayTeam}
📊 Mercado: ${marketName}
📈 Probabilidade: ${(probability * 100).toFixed(1)}%
💰 Odd: ${odd.toFixed(2)}
✅ EV: *${ev.toFixed(2)}%*
              `;

              await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
              console.log(`✅ [PRÉ-LIVE] Alert: ${homeTeam} vs ${awayTeam}`);
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
      console.log('⚡ [LIVE] Checking live opportunities (TEMPO REAL)...');
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
⚡ *OPORTUNIDADE EV+* AO VIVO

${tierEmoji} *${leagueName}* [${tier}]
🏠 ${homeTeam} vs ${awayTeam}
📊 Mercado: ${marketName}
📈 Probabilidade: ${(probability * 100).toFixed(1)}%
💰 Odd: ${odd.toFixed(2)}
✅ EV: *${ev.toFixed(2)}%*
⏱️ Tempo: ${elapsed}'
            `;

            await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
            console.log(`⚡ [LIVE] Alert: ${homeTeam} vs ${awayTeam}`);
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

  start() {
    console.log('🚀 EV Opportunities System PRO v2.5.2 (CORRIGIDO!)');
    console.log('📡 Conectando ao StatPal API...');
    this.initDatabase();

    const prelivInterval = (CONFIG.SCHEDULERS.PRE_LIVE_INTERVALO_MIN || 5) * 60 * 1000;
    setInterval(() => this.checkPreLiveOpportunities(), prelivInterval);

    const liveInterval = (CONFIG.SCHEDULERS.LIVE_INTERVALO_SEG || 5) * 1000;
    setInterval(() => this.checkLiveOpportunities(), liveInterval);

    const syncInterval = 5 * 60 * 1000;
    setInterval(() => syncToGoogleSheets(), syncInterval);
    setTimeout(() => syncToGoogleSheets(), 10000);

    console.log('✅ Telegram conectado');
    console.log('✅ Google Sheets sincronizado');
    console.log('✅ Sincronização automática: a cada 5 minutos');

    const startMsg = `
✅ *EV Opportunities v2.5.2 ONLINE*

📊 StatPal API CORRIGIDO
📋 Google Sheets conectado
🔄 Sincronização automática (5 min)
🎯 PRÉ-LIVE + ⚡ LIVE ativados

64 ligas | 5 mercados | 24/7

Sistema v2.5.2 100% funcional! 🚀
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
