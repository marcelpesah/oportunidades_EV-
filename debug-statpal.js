const axios = require('axios');
require('dotenv').config();

const STATPAL_API_KEY = process.env.STATPAL_API_KEY || '100a7f32-ed19-4851-8298-bf92499a7a9c';
const STATPAL_URL = 'https://statpal.io/api/v2/soccer/matches/live';

async function debugStatPal() {
  try {
    console.log('🔍 DEBUG: Testando StatPal API...\n');
    console.log(`📡 URL: ${STATPAL_URL}`);
    console.log(`🔑 API Key: ${STATPAL_API_KEY.substring(0, 10)}...`);
    console.log('\n⏳ Aguardando resposta...\n');

    const response = await axios.get(STATPAL_URL, {
      params: {
        access_key: STATPAL_API_KEY
      },
      timeout: 10000
    });

    console.log('✅ RESPOSTA RECEBIDA!\n');
    console.log('📊 ESTRUTURA DO JSON:');
    console.log('─'.repeat(60));
    console.log(JSON.stringify(Object.keys(response.data), null, 2));
    console.log('─'.repeat(60));

    console.log('\n📈 TAMANHO DOS DADOS:');
    for (const key of Object.keys(response.data)) {
      const value = response.data[key];
      if (Array.isArray(value)) {
        console.log(`  • ${key}: ${value.length} items`);
        if (value.length > 0) {
          console.log(`    └─ Primeiro item (preview):`);
          console.log(`    ${JSON.stringify(value[0]).substring(0, 100)}...`);
        }
      } else if (typeof value === 'object') {
        console.log(`  • ${key}: object`);
      } else {
        console.log(`  • ${key}: ${value}`);
      }
    }

    console.log('\n🎯 CHAVES DETECTADAS:');
    const keys = Object.keys(response.data);
    keys.forEach(key => {
      console.log(`  ✓ ${key}`);
    });

    console.log('\n💡 CORREÇÃO NECESSÁRIA:');
    if (response.data.live_matches !== undefined) {
      console.log(`  ✅ Usar: response.data.live_matches`);
      console.log(`  📊 Contém: ${response.data.live_matches.length} matches`);
    } else if (response.data.data !== undefined) {
      console.log(`  ✅ Usar: response.data.data`);
      console.log(`  📊 Contém: ${response.data.data.length} matches`);
    } else if (response.data.matches !== undefined) {
      console.log(`  ✅ Usar: response.data.matches`);
      console.log(`  📊 Contém: ${response.data.matches.length} matches`);
    } else if (Array.isArray(response.data)) {
      console.log(`  ✅ Usar: response.data diretamente (é um array)`);
      console.log(`  📊 Contém: ${response.data.length} matches`);
    } else {
      console.log(`  ⚠️ Estrutura desconhecida!`);
      console.log(`  📝 JSON COMPLETO (primeiros 500 chars):`);
      console.log(`  ${JSON.stringify(response.data).substring(0, 500)}`);
    }

    console.log('\n' + '═'.repeat(60));

  } catch (error) {
    console.error('❌ ERRO AO CONECTAR:');
    console.error(`  Mensagem: ${error.message}`);
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Dados: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
  }
}

debugStatPal();
