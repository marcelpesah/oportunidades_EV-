/**
 * Setup Auto Config - Gera config.json automaticamente do StatPal
 * Uso: node setup-auto-config.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Config
const STATPAL_API_KEY = process.env.STATPAL_API_KEY || '100a7f32-ed19-4851-8298-bf92499a7a9c';
const STATPAL_URL = 'https://statpal.io/api/v2/soccer/matches/live';

// Ligas principais para categorização
const TIER1_KEYWORDS = [
  'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
  'Liga Portugal', 'Eredivisie', 'Super Lig', 'Série A', 'Liga MX',
  'MLS', 'Superliga Argentina', 'Primeira Liga', 'Championship',
  'Serie B', '2. Bundesliga', 'Ligue 2', 'Eredivisie'
];

async function fetchMatches() {
  try {
    console.log('🔍 Buscando matches do StatPal...');
    const response = await axios.get(STATPAL_URL, {
      params: { access_key: STATPAL_API_KEY },
      timeout: 30000
    });

    const matches = response.data.data || [];
    console.log(`✅ ${matches.length} matches encontrados!`);
    return matches;
  } catch (error) {
    console.error('❌ Erro ao buscar matches:', error.message);
    return [];
  }
}

function extractLeagues(matches) {
  const leagues = {};

  for (const match of matches) {
    try {
      const league = match.league || {};
      const leagueId = league.id;
      const leagueName = league.name || 'Unknown';

      if (leagueId && leagueName) {
        if (!leagues[leagueId]) {
          leagues[leagueId] = {
            name: leagueName,
            matches: 0,
            country: league.country || 'Unknown'
          };
        }
        leagues[leagueId].matches += 1;
      }
    } catch (err) {
      continue;
    }
  }

  return leagues;
}

function categorizeLeagues(leagues) {
  const tier1 = {};
  const tier2 = {};
  const tier3 = {};

  // Ordenar por matches
  const sorted = Object.entries(leagues)
    .sort((a, b) => b[1].matches - a[1].matches);

  for (const [leagueId, info] of sorted) {
    const isTier1 = TIER1_KEYWORDS.some(kw => 
      info.name.toLowerCase().includes(kw.toLowerCase())
    );

    if (isTier1) {
      tier1[leagueId] = info.name;
    } else if (info.matches >= 3) {
      tier2[leagueId] = info.name;
    } else {
      tier3[leagueId] = info.name;
    }
  }

  return { tier1, tier2, tier3 };
}

function generateConfig(tier1, tier2, tier3) {
  return {
    "LIGAS": {
      "TIER1": tier1,
      "TIER2": tier2,
      "TIER3": tier3
    },
    "MERCADOS_CONFIG": {
      "vitoria_1x2": {
        "nome": "Vitória 1x2",
        "ativo": true,
        "odd": { "minima": 1.1, "maxima": 20.0 },
        "ev_minimo": { "TIER1": 2.0, "TIER2": 2.5, "TIER3": 3.5 }
      },
      "ambos_marcam": {
        "nome": "Ambos Marcam",
        "ativo": true,
        "odd": { "minima": 1.1, "maxima": 20.0 },
        "ev_minimo": { "TIER1": 2.0, "TIER2": 2.5, "TIER3": 4.0 }
      },
      "handicap_asiatico": {
        "nome": "Handicap Asiático",
        "ativo": true,
        "odd": { "minima": 1.1, "maxima": 20.0 },
        "ev_minimo": { "TIER1": 2.5, "TIER2": 3.0, "TIER3": 4.5 }
      },
      "over_under_escanteios": {
        "nome": "Over/Under Escanteios (8.5)",
        "ativo": true,
        "odd": { "minima": 1.1, "maxima": 20.0 },
        "ev_minimo": { "TIER1": 2.5, "TIER2": 3.5, "TIER3": 5.0 }
      },
      "over_under_cartoes": {
        "nome": "Over/Under Cartões (4.5)",
        "ativo": true,
        "odd": { "minima": 1.1, "maxima": 20.0 },
        "ev_minimo": { "TIER1": 3.0, "TIER2": 4.0, "TIER3": 5.5 }
      }
    },
    "PARAMETROS_GLOBAIS": {
      "probabilidade_minima": 0.30,
      "probabilidade_maxima": 0.95
    },
    "SCHEDULERS": {
      "PRE_LIVE_INTERVALO_MIN": 5,
      "LIVE_INTERVALO_SEG": 5,
      "RESULTADO_CHECK_INTERVALO_MIN": 5,
      "RESUMO_DIARIO_HORA": 23,
      "RESUMO_DIARIO_MINUTO": 59
    }
  };
}

async function main() {
  console.log('🚀 Setup Auto Config - Gerando config.json\n');

  // Buscar matches
  const matches = await fetchMatches();
  if (matches.length === 0) {
    console.error('❌ Nenhum match encontrado!');
    process.exit(1);
  }

  // Extrair ligas
  console.log('📊 Extraindo ligas...');
  const leagues = extractLeagues(matches);
  console.log(`✅ ${Object.keys(leagues).length} ligas encontradas!\n`);

  // Categorizar
  console.log('🎯 Categorizando ligas...');
  const { tier1, tier2, tier3 } = categorizeLeagues(leagues);
  console.log(`📈 TIER1: ${Object.keys(tier1).length}`);
  console.log(`📊 TIER2: ${Object.keys(tier2).length}`);
  console.log(`📉 TIER3: ${Object.keys(tier3).length}\n`);

  // Gerar config
  console.log('⚙️  Gerando config.json...');
  const config = generateConfig(tier1, tier2, tier3);

  // Salvar
  const configPath = path.join(__dirname, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

  console.log(`✅ Arquivo 'config.json' criado com sucesso!\n`);

  // Resumo
  console.log('═'.repeat(60));
  console.log('📋 RESUMO DO CONFIG GERADO:');
  console.log('═'.repeat(60));
  console.log(`\n🔴 TIER1 (Principais - ${Object.keys(tier1).length}):`);
  Object.entries(tier1).slice(0, 10).forEach(([id, name]) => {
    console.log(`  • ${name} (ID: ${id})`);
  });
  if (Object.keys(tier1).length > 10) {
    console.log(`  ... e mais ${Object.keys(tier1).length - 10}`);
  }

  console.log(`\n📊 TIER2 (Secundárias - ${Object.keys(tier2).length}):`);
  Object.entries(tier2).slice(0, 10).forEach(([id, name]) => {
    console.log(`  • ${name} (ID: ${id})`);
  });
  if (Object.keys(tier2).length > 10) {
    console.log(`  ... e mais ${Object.keys(tier2).length - 10}`);
  }

  console.log(`\n📉 TIER3 (Outras - ${Object.keys(tier3).length}):`);
  Object.entries(tier3).slice(0, 10).forEach(([id, name]) => {
    console.log(`  • ${name} (ID: ${id})`);
  });
  if (Object.keys(tier3).length > 10) {
    console.log(`  ... e mais ${Object.keys(tier3).length - 10}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📍 PRÓXIMOS PASSOS:');
  console.log('═'.repeat(60));
  console.log('1. ✅ config.json foi gerado nesta pasta');
  console.log('2. 🔄 Faça commit no GitHub');
  console.log('3. 🚀 Railway faz redeploy automático');
  console.log('4. 📊 Sistema monitora TODAS as ligas!\n');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
