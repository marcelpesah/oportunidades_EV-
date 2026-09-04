const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({ connectionString: DATABASE_URL });
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

async function testForcedOpportunity() {
  try {
    console.log('\n🧪 TESTE FORÇADO DE OPORTUNIDADE EV+\n');

    // 1. Criar tabela se não existir
    console.log('📊 Criando tabela...');
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
    console.log('✅ Tabela pronta\n');

    // 2. Inserir oportunidade FORÇADA
    console.log('💾 Salvando oportunidade no banco...');
    const result = await pool.query(
      `INSERT INTO opportunities 
       (match_id, league, tier, home_team, away_team, market, probability, odd, ev_percentage, status, alert_type, calculation_type, alert_sent_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       RETURNING *`,
      [
        'TEST_MATCH_001',           // match_id
        'Premier League',           // league
        'TIER1',                    // tier
        'Manchester City',          // home_team
        'Liverpool',                // away_team
        'Vitória 1x2',              // market
        65.5,                       // probability (65.5%)
        1.92,                       // odd
        25.36,                      // ev_percentage (25.36%!)
        'ALERTED',                  // status
        'LIVE',                     // alert_type
        'REALTIME'                  // calculation_type
      ]
    );

    console.log('✅ Oportunidade salva no banco!\n');
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   Match: ${result.rows[0].home_team} vs ${result.rows[0].away_team}`);
    console.log(`   EV: ${result.rows[0].ev_percentage}%\n`);

    // 3. Enviar mensagem Telegram
    console.log('📱 Enviando alerta no Telegram...');
    const message = `
⚡ *TESTE FORÇADO - OPORTUNIDADE EV+*

🔴 *Premier League* [TIER1]
🏠 Manchester City vs Liverpool
📊 Mercado: Vitória 1x2
📈 Probabilidade: 65.5%
💰 Odd: 1.92
✅ EV: *25.36%*
⏱️ Tempo: 45'

🧪 Este é um TESTE FORÇADO para validação do sistema!
    `;

    await bot.sendMessage(TELEGRAM_USER_ID, message, { parse_mode: 'Markdown' });
    console.log('✅ Alerta enviado no Telegram!\n');

    // 4. Verificar no banco
    console.log('🔍 Verificando dados no banco...');
    const checkResult = await pool.query('SELECT COUNT(*) as total FROM opportunities');
    console.log(`✅ Total de oportunidades no banco: ${checkResult.rows[0].total}\n`);

    console.log('═'.repeat(60));
    console.log('🎉 TESTE COMPLETO!');
    console.log('═'.repeat(60));
    console.log('\n✅ Se você recebeu a mensagem no Telegram E o banco tem dados:');
    console.log('   TUDO ESTÁ FUNCIONANDO 100%! 🚀\n');

    await pool.end();
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error.message);
    process.exit(1);
  }
}

testForcedOpportunity();
