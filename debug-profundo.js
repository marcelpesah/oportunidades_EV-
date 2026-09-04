const axios = require('axios');
require('dotenv').config();

const STATPAL_API_KEY = process.env.STATPAL_API_KEY || '100a7f32-ed19-4851-8298-bf92499a7a9c';
const url = 'https://statpal.io/api/v2/soccer/matches/live';

async function debug() {
  try {
    const res = await axios.get(url, { params: { access_key: STATPAL_API_KEY }, timeout: 10000 });
    const data = res.data;

    console.log('\n📊 ESTRUTURA PROFUNDA:\n');
    
    console.log('📍 response.data:');
    console.log(`   Chaves: ${Object.keys(data).join(', ')}`);
    
    if (data.live_matches) {
      console.log('\n📍 response.data.live_matches:');
      console.log(`   Tipo: ${typeof data.live_matches}`);
      console.log(`   Chaves: ${Object.keys(data.live_matches).join(', ')}`);
      
      for (const key of Object.keys(data.live_matches)) {
        const val = data.live_matches[key];
        console.log(`\n   🔹 .${key}:`);
        console.log(`      Tipo: ${typeof val}`);
        
        if (Array.isArray(val)) {
          console.log(`      Array com ${val.length} items`);
        } else if (typeof val === 'object' && val !== null) {
          console.log(`      Object com chaves: ${Object.keys(val).join(', ')}`);
        } else {
          console.log(`      Value: ${String(val).substring(0, 50)}`);
        }
      }
    }
    
    console.log('\n');
  } catch (e) {
    console.error('❌ Erro:', e.message);
  }
}

debug();
