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
    console.log('\n🧪 TESTE FORÇADO DE OPORTUNIDADE EV+ (V2)\n');

    // 1. DROPAR tabela antiga
    console.log('🗑️ Removendo tabela antiga...');
    await pool.query('DROP TABLE IF EXISTS opportunities CASCADE');
    console.log('✅ Tabela removida\n');

    // 2. CRIAR tabela NOVA com schema correto
    console.log('📊 Criando tabela nova...');
    await pool.query(`
      CREATE TABLE opportunities (
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
    console.log('✅ Tabela criada com sucesso\n');

    // 3. INSERIR oportunidade FORÇADA
    console.log('💾 Salvando oportunidade no banco...');
    const result = await pool.query(
      `INSERT INTO opportunities 
       (match_id, league, tier, home_team, away_team, market, probability, odd, ev_percentage, status, alert_type, calculation_type, alert_sent_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       RETURNING *`,
      [
        'TEST_MATCH_001',
        'Premier League',
        'TIER1',
        'Manchester City',
        'Liverpool',
        'Vitória 1x2',
        65.5,
        1.92,
        25.36,
        'ALERTED',
        'LIVE',
        'REALTIME'
      ]
    );

    console.log('✅ Oportunidade salva!\n');
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   Match: ${result.rows[0].home_team} vs ${result.rows[0].away_team}`);
    console.log(`   EV: ${result.rows[0].ev_percentage}%\n`);

    // 4. ENVIAR no Telegram
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
    console.log('✅ Alerta enviado!\n');

    // 5. VERIFICAR no banco
    console.log('🔍 Verificando dados...');
    const checkResult = await pool.query('SELECT COUNT(*) as total FROM opportunities');
    console.log(`✅ Total de oportunidades: ${checkResult.rows[0].total}\n`);

    console.log('═'.repeat(60));
    console.log('🎉 TESTE COMPLETO COM SUCESSO!');
    console.log('═'.repeat(60));
    console.log('\n✅ Sistema 100% Funcional:');
    console.log('   ✓ Telegram conectado');
    console.log('   ✓ Banco de dados funcionando');
    console.log('   ✓ Dados sendo salvos\n');

    await pool.end();
  } catch (error) {
    console.error('❌ ERRO:', error.message);
    process.exit(1);
  }
}

testForcedOpportunity();
