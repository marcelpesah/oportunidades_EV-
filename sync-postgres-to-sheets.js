const { google } = require('googleapis');
const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_CREDENTIALS_JSON = process.env.GOOGLE_CREDENTIALS_JSON;

const pool = new Pool({ connectionString: DATABASE_URL });
let sheetsClient = null;

async function initGoogleSheets() {
  try {
    if (!GOOGLE_CREDENTIALS_JSON) {
      console.error('❌ GOOGLE_CREDENTIALS_JSON não configurado');
      return null;
    }

    const credentials = JSON.parse(GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets conectado para sincronização');
    return sheetsClient;
  } catch (err) {
    console.error('❌ Erro ao conectar Google Sheets:', err.message);
    return null;
  }
}

async function syncToGoogleSheets() {
  try {
    if (!sheetsClient || !GOOGLE_SHEETS_ID) {
      console.log('⏭️ Google Sheets não configurado, pulando sincronização');
      return;
    }

    console.log('🔄 Sincronizando dados com Google Sheets...');

    // Busca todos os dados do PostgreSQL
    const result = await pool.query(
      `SELECT 
        TO_CHAR(created_at, 'DD/MM/YYYY') as data,
        TO_CHAR(created_at, 'HH:MM:SS') as hora,
        league as liga,
        tier,
        market as mercado,
        CONCAT(home_team, ' vs ', away_team) as times,
        ROUND(CAST(probability AS NUMERIC), 3) as probabilidade,
        ROUND(CAST(odd AS NUMERIC), 2) as odd,
        ROUND(CAST(ev_percentage AS NUMERIC), 2) as ev,
        CASE 
          WHEN alert_type = 'PRE_LIVE' THEN '🎯 PRÉ-LIVE'
          WHEN alert_type = 'LIVE' THEN '⚡ LIVE'
          ELSE alert_type
        END as tipo,
        CASE 
          WHEN status = 'ALERTED' THEN 'ALERTADO'
          WHEN status = 'RESOLVED' AND green_red = 'GREEN' THEN '🟢 GREEN'
          WHEN status = 'RESOLVED' AND green_red = 'RED' THEN '🔴 RED'
          ELSE status
        END as status
      FROM opportunities
      ORDER BY created_at DESC
      LIMIT 1000`
    );

    if (result.rows.length === 0) {
      console.log('ℹ️ Nenhum dado para sincronizar');
      return;
    }

    // Prepara os dados pra planilha
    const headers = [
      ['Data', 'Hora', 'Liga', 'Tier', 'Mercado', 'Times', 'Probabilidade%', 'Odd', 'EV%', 'Tipo', 'Status']
    ];

    const rows = result.rows.map(row => [
      row.data,
      row.hora,
      row.liga,
      row.tier,
      row.mercado,
      row.times,
      row.probabilidade,
      row.odd,
      row.ev,
      row.tipo,
      row.status
    ]);

    // Limpa a planilha (remove tudo exceto headers)
    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: 'Planilha1!A:K',
    });

    // Escreve headers + dados
    const allData = [...headers, ...rows];

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: 'Planilha1!A1:K1000',
      valueInputOption: 'RAW',
      resource: { values: allData },
    });

    console.log(`✅ Sincronização concluída! ${result.rows.length} registros`);
  } catch (err) {
    console.error('❌ Erro ao sincronizar:', err.message);
  }
}

// Inicializa e roda a sincronização a cada 5 minutos
async function start() {
  console.log('🚀 Iniciando sincronizador PostgreSQL → Google Sheets');
  
  await initGoogleSheets();
  
  // Roda na primeira vez
  await syncToGoogleSheets();
  
  // Depois roda a cada 5 minutos
  setInterval(async () => {
    await syncToGoogleSheets();
  }, 5 * 60 * 1000); // 5 minutos
  
  console.log('✅ Sincronizador rodando continuamente (a cada 5 min)');
}

start();

process.on('unhandledRejection', (reason) => console.error('❌ Rejection:', reason));
process.on('uncaughtException', (error) => console.error('❌ Exception:', error));
