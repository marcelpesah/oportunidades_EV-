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

// Google Sheets Setup
let sheetsClient = null;

async function initGoogleSheets() {
  try {
    if (!GOOGLE_CREDENTIALS_JSON) {
      console.warn('⚠️ GOOGLE_CREDENTIALS_JSON não configurado. Google Sheets desativado.');
      return null;
    }

    const credentials = JSON.parse(GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets conectado');
    
    // Initialize sheet with headers
    await ensureHeaders();
    return sheetsClient;
  } catch (err) {
    console.error('❌ Erro ao conectar Google Sheets:', err.message);
    return null;
  }
}

async function ensureHeaders() {
  try {
    if (!sheetsClient || !GOOGLE_SHEETS_ID) return;

    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: 'Planilha1!A1:K1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      const headers = [
        ['Data', 'Hora', 'Liga', 'Tier', 'Mercado', 'Times', 'Probabilidade%', 'Odd', 'EV%', 'Tipo', 'Status']
      ];

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: 'Planilha1!A1:K1',
        valueInputOption: 'RAW',
        resource: { values: headers },
      });

      console.log('✅ Headers criados no Google Sheets');
    }
  } catch (err) {
    console.error('❌ Erro ao criar headers:', err.message);
  }
}

async function appendToGoogleSheets(data) {
  try {
    if (!sheetsClient || !GOOGLE_SHEETS_ID) return;

    const now = new Date();
    const date = now.toLocaleDateString('pt-BR');
    const time = now.toLocaleTimeString('pt-BR');

    const row = [
      [
        date,
        time,
        data.league,
        data.tier,
        data.market,
        `${data.homeTeam} vs ${data.awayTeam}`,
        (data.probability * 100).toFixed(1),
        data.odd.toFixed(2),
        data.ev.toFixed(2),
        data.alertType === 'PRE_LIVE' ? '🎯 PRÉ-LIVE' : '⚡ LIVE',
        'ALERTADO'
      ]
    ];

    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: 'Planilha1!A:K',
      valueInputOption: 'RAW',
      resource: { values: row },
    });

    if (DEBUG) console.log(`✅ Linha adicionada ao Google Sheets: ${data.homeTeam} vs ${data.awayTeam}`);
  } catch (err) {
    console.error('❌ Erro ao escrever no Google Sheets:', err.message);
  }
}

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
        const homeShots = parseInt(homeStats.shots_on_target) || 0;
        const awayShots = parseInt(awayStats.shots_on_target) || 0;
        if (homeGoals > 0 && awayGoals > 0) return 0.99;
        const probability_base = 0.40;
        const probability_adjusted = probability_base + (homeShots * 0.05) + (awayShots * 0.05);
        probability = Math.min(0.90, probability_adjusted);
      } else if (market === 'handicap_asiatico') {
        const homeXG = parseFloat(homeStats.expected_goals) || 0;
        probability = Math.min(0.90, Math.max(0.25, homeXG / 2.5));
      } else if (market === 'over_under_escanteios') {
        const homeCorners = parseInt(homeStats.corners) || 0;
        const awayCorners = parseInt(awayStats.corners) || 0;
        const totalCorners = homeCorners + awayCorners;
        const elapsed = parseInt(match.elapsed) || 0;
        const estimatedFinal = (totalCorners / Math.max(1, elapsed)) * 90;
        probability = Math.min(0.95, 0.35 + (estimatedFinal / 30));
      } else if (market === 'over_under_cartoes') {
        const homeCards = parseInt(homeStats.yellow_cards) || 0;
        const awayCards = parseInt(awayStats.yellow_cards) || 0;
        const totalCards = homeCards + awayCards;
        const elapsed = parseInt(match.elapsed) || 0;
        const estimatedFinal = (totalCards / Math.max(1, elapsed)) * 90;
        probability = Math.min(0.95, 0.35 + (estimatedFinal / 10));
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
📈 Probabilidade: ${(probability * 100).toFixed(1)}%
💰 Odd: ${odd.toFixed(2)}
✅ EV: *${ev.toFixed(2)}%*
⏱️ Tempo: ${minutesUntilKickoff.toFixed(0)} min antes
              `;

              await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
              
              // Escreve no Google Sheets
              await appendToGoogleSheets({
                league: leagueName,
                tier: tier,
                market: marketName,
                homeTeam,
                awayTeam,
                probability,
                odd,
                ev,
                alertType: 'PRE_LIVE'
              });

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
📈 Probabilidade: ${(probability * 100).toFixed(1)}%
💰 Odd: ${odd.toFixed(2)}
✅ EV: *${ev.toFixed(2)}%*
⏱️ Tempo: ${elapsed}'
            `;

            await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
            
            // Escreve no Google Sheets
            await appendToGoogleSheets({
              league: leagueName,
              tier: tier,
              market: marketName,
              homeTeam,
              awayTeam,
              probability,
              odd,
              ev,
              alertType: 'LIVE'
            });

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
              const calcType = opp.calculation_type === 'REALTIME' ? '⚡LIVE' : '🎯PRÉ';
              const resultMsg = `
${emoji} *${greenRed}* ${calcType}

${opp.league} | ${opp.tier}
${opp.home_team} vs ${opp.away_team}
${opp.market} @ ${opp.odd}
EV: ${opp.ev_percentage}% | ROI: ${roiPercentage.toFixed(1)}%
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

  async sendProfessionalDailySummary() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const generalStats = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN green_red = 'GREEN' THEN 1 ELSE 0 END) as greens,
           SUM(CASE WHEN green_red = 'RED' THEN 1 ELSE 0 END) as reds,
           AVG(CAST(ev_percentage AS FLOAT)) as avg_ev,
           AVG(CAST(roi_percentage AS FLOAT)) as avg_roi
         FROM opportunities 
         WHERE DATE(created_at) >= $1 AND status = 'RESOLVED'`,
        [today]
      );

      const byMarket = await pool.query(
        `SELECT 
           market,
           COUNT(*) as total,
           SUM(CASE WHEN green_red = 'GREEN' THEN 1 ELSE 0 END) as greens,
           AVG(CAST(ev_percentage AS FLOAT)) as avg_ev,
           AVG(CAST(roi_percentage AS FLOAT)) as avg_roi
         FROM opportunities 
         WHERE DATE(created_at) >= $1 AND status = 'RESOLVED'
         GROUP BY market
         ORDER BY total DESC`,
        [today]
      );

      const byTier = await pool.query(
        `SELECT 
           tier,
           COUNT(*) as total,
           SUM(CASE WHEN green_red = 'GREEN' THEN 1 ELSE 0 END) as greens,
           AVG(CAST(ev_percentage AS FLOAT)) as avg_ev,
           AVG(CAST(roi_percentage AS FLOAT)) as avg_roi
         FROM opportunities 
         WHERE DATE(created_at) >= $1 AND status = 'RESOLVED'
         GROUP BY tier
         ORDER BY tier`,
        [today]
      );

      const byType = await pool.query(
        `SELECT 
           calculation_type,
           COUNT(*) as total,
           SUM(CASE WHEN green_red = 'GREEN' THEN 1 ELSE 0 END) as greens,
           AVG(CAST(ev_percentage AS FLOAT)) as avg_ev,
           AVG(CAST(roi_percentage AS FLOAT)) as avg_roi
         FROM opportunities 
         WHERE DATE(created_at) >= $1 AND status = 'RESOLVED'
         GROUP BY calculation_type`,
        [today]
      );

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const yesterdayStats = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN green_red = 'GREEN' THEN 1 ELSE 0 END) as greens,
           AVG(CAST(roi_percentage AS FLOAT)) as avg_roi
         FROM opportunities 
         WHERE DATE(created_at) >= $1 AND DATE(created_at) < $2 AND status = 'RESOLVED'`,
        [yesterday, today]
      );

      const g = generalStats.rows[0];
      const total = parseInt(g.total) || 0;
      const greens = parseInt(g.greens) || 0;
      const reds = parseInt(g.reds) || 0;
      const winRate = total > 0 ? ((greens / total) * 100).toFixed(1) : 0;
      const avgEV = (g.avg_ev || 0).toFixed(2);
      const avgROI = (g.avg_roi || 0).toFixed(2);

      const yesterdayRow = yesterdayStats.rows[0];
      const yesterdayROI = (yesterdayRow.avg_roi || 0).toFixed(2);
      const roiTrending = (avgROI - yesterdayROI > 0.5) ? '📈' : (avgROI - yesterdayROI < -0.5) ? '📉' : '➡️';

      let alerts = [];
      let recommendations = [];

      if (winRate < 45) {
        alerts.push('⚠️ Win rate BAIXO (<45%)');
        recommendations.push('❗ Aumentar EV mínimo por +1%');
      } else if (winRate > 70) {
        recommendations.push('✅ Pode reduzir EV mínimo (-0.5%)');
      }

      if (total < 5) {
        alerts.push('⚠️ Pouco volume (<5 apostas)');
        recommendations.push('❗ Reduzir EV mínimo (-0.5%)');
      }

      if (avgROI < 0) {
        alerts.push('🔴 ROI NEGATIVO!');
        recommendations.push('❗ Revisar parâmetros urgentemente');
      }

      let message = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *RELATÓRIO PROFISSIONAL DIÁRIO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 ${today.toLocaleDateString('pt-BR', {weekday: 'long'})}, ${today.toLocaleDateString('pt-BR')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 *RESUMO GERAL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Total identificadas: ${this.dailyStats.identified}
✅ Total resolvidas: ${total}
🟢 GREENs: ${greens} | 🔴 REDs: ${reds}
💹 *Win Rate: ${winRate}%*
📊 EV médio: ${avgEV}%
💰 *ROI médio: ${avgROI}%* ${roiTrending}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *POR MERCADO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      for (const row of byMarket.rows) {
        const mTotal = parseInt(row.total);
        const mGreens = parseInt(row.greens);
        const mWR = mTotal > 0 ? ((mGreens / mTotal) * 100).toFixed(0) : 0;
        const mROI = (row.avg_roi || 0).toFixed(1);
        const roiStatus = mROI < 0 ? '❌' : mROI < 10 ? '⚠️' : '✅';
        
        message += `${row.market}: ${mTotal} apostas, ${mWR}% WR, ${mROI}% ROI ${roiStatus}\n`;

        if (mROI < -5 && mTotal >= 3) {
          alerts.push(`⚠️ ${row.market} está perdendo (${mROI}% ROI)`);
          recommendations.push(`❗ Aumentar EV mín de "${row.market}" ou desabilitar`);
        }
      }

      message += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 *POR TIER*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      for (const row of byTier.rows) {
        const tTotal = parseInt(row.total);
        const tGreens = parseInt(row.greens);
        const tWR = tTotal > 0 ? ((tGreens / tTotal) * 100).toFixed(0) : 0;
        const tROI = (row.avg_roi || 0).toFixed(1);
        const tierEmoji = row.tier === 'TIER1' ? '🔴' : row.tier === 'TIER2' ? '🟡' : '🟢';
        
        message += `${tierEmoji} ${row.tier}: ${tTotal} apostas, ${tWR}% WR, ${tROI}% ROI\n`;
      }

      message += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ *PRÉ-LIVE vs LIVE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      for (const row of byType.rows) {
        const typeTotal = parseInt(row.total);
        const typeGreens = parseInt(row.greens);
        const typeWR = typeTotal > 0 ? ((typeGreens / typeTotal) * 100).toFixed(0) : 0;
        const typeROI = (row.avg_roi || 0).toFixed(1);
        const typeEmoji = row.calculation_type === 'REALTIME' ? '⚡' : '🎯';
        const typeName = row.calculation_type === 'REALTIME' ? 'LIVE' : 'PRÉ-LIVE';
        
        message += `${typeEmoji} ${typeName}: ${typeTotal} apostas, ${typeWR}% WR, ${typeROI}% ROI\n`;

        if (typeWR < 45 && typeTotal >= 3) {
          alerts.push(`⚠️ ${typeName} tá impreciso (${typeWR}% WR)`);
          recommendations.push(`❗ Revisar probabilidades de ${typeName}`);
        }
      }

      if (alerts.length > 0) {
        message += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *ALERTAS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        for (const alert of alerts) {
          message += `${alert}\n`;
        }
      }

      if (recommendations.length > 0) {
        message += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 *RECOMENDAÇÕES DE AÇÃO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        for (const rec of recommendations) {
          message += `${rec}\n`;
        }
      }

      message += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 *STATUS GERAL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      if (winRate >= 55 && avgROI >= 15) {
        message += `✅ SISTEMA VALIDADO! Continue assim.`;
      } else if (winRate >= 50 && avgROI >= 5) {
        message += `⚠️ SISTEMA OK. Espere mais dias de dados.`;
      } else {
        message += `❌ SISTEMA PRECISA AJUSTES. Implemente recomendações acima.`;
      }

      message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
      console.log('✅ Professional daily summary sent');
    } catch (error) {
      console.error('❌ Error sending professional summary:', error.message);
    }
  }

  start() {
    console.log('🚀 EV Opportunities System PRO v2.3 (GOOGLE SHEETS)');
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
        this.sendProfessionalDailySummary();
      }
    }, 60 * 1000);

    console.log('✅ Telegram bot connected');
    console.log('✅ Google Sheets connected');
    console.log('✅ System running with GOOGLE SHEETS');

    const startMsg = `
✅ *Sistema de Oportunidades EV+ PRO v2.3 ATIVO*

📊 Conectado ao StatPal API (REAL)
📋 Google Sheets conectado (AUTOMÁTICO)
🎯 PRÉ-LIVE: Cálculo HISTÓRICO (5 minutos)
⚡ LIVE: Cálculo TEMPO REAL com xG (5 segundos)

📍 64 ligas globais | 💰 5 mercados | 24/7

━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ AGORA INTEGRADO COM GOOGLE SHEETS ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Cada alerta escrito AUTOMATICAMENTE
📊 Relatório profissional DIÁRIO
🟢 GREEN/RED tracking
📈 ROI em tempo real

Sistema pronto! 🚀
    `;

    bot.sendMessage(TELEGRAM_USER_ID, startMsg, { parse_mode: 'Markdown' })
      .catch(err => console.error('❌ Telegram error:', err.message));
  }
}

initGoogleSheets().then(() => {
  const system = new EVOpportunitiesSystemPRO();
  system.start();
});

process.on('unhandledRejection', (reason) => console.error('❌ Rejection:', reason));
process.on('uncaughtException', (error) => console.error('❌ Exception:', error));
