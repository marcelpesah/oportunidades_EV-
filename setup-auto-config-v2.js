/**
 * Setup Auto Config v2 - Gera config.json com fallback de ligas padrão
 * Usa StatPal se tiver matches, senão usa ligas conhecidas
 * Uso: node setup-auto-config-v2.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const STATPAL_API_KEY = process.env.STATPAL_API_KEY || '100a7f32-ed19-4851-8298-bf92499a7a9c';
const STATPAL_URL = 'https://statpal.io/api/v2/soccer/matches/live';

// Ligas DEFAULT (fallback se StatPal sem dados)
const DEFAULT_LEAGUES = {
  TIER1: {
    "39": "Premier League",
    "140": "La Liga",
    "135": "Serie A",
    "78": "Bundesliga",
    "61": "Ligue 1",
    "238": "Liga Portugal",
    "87": "Eredivisie",
    "75": "Super Lig",
    "71": "Série A Brasil",
    "100": "Superliga Argentina",
    "262": "Liga MX",
    "179": "MLS",
    "203": "Primeira Liga",
    "40": "Championship",
    "141": "Segunda División"
  },
  TIER2: {
    "79": "2. Bundesliga",
    "62": "Ligue 2",
    "73": "Primeira Divisão Portugal",
    "88": "Eerste Divisie",
    "136": "Serie B",
    "142": "Segunda B",
    "180": "USL Championship",
    "50": "Scottish Premiership",
    "51": "Belgian Pro League",
    "52": "Super League Greece",
    "53": "Super League Switzerland",
    "54": "Austrian Bundesliga",
    "55": "Ekstraklasa Poland",
    "57": "Superliga Denmark",
    "58": "Allsvenskan Sweden"
  },
  TIER3: {
    "59": "Eliteserien Norway",
    "200": "Premier League Egypt",
    "201": "Premier League South Africa",
    "202": "Premier League Nigeria",
    "118": "K League South Korea",
    "119": "J League Japan",
    "120": "Super League China",
    "121": "A League Australia",
    "122": "Super Lig Thailand",
    "123": "V League Vietnam",
    "124": "ISL India",
    "125": "Saudi Pro League",
    "126": "UAE Pro League",
    "127": "Turkish Super League",
    "128": "Israeli Premier League"
  }
};

async function fetchMatches() {
  try {
    console.log('🔍 Buscando matches do StatPal...');
    const response = await axios.get(STATPAL_URL, {
      params: { access_key: STATPAL_API_KEY },
      timeout: 30000
    });

    const matches = response.data.data || [];
    if (matches.length > 0) {
      console.log(`✅ ${matches.length} matches encontrados!`);
      return matches;
    } else {
      console.log('⚠️ Nenhum match ao vivo agora (usando ligas padrão)');
      return null;
    }
  } catch (error) {
    console.error('⚠️ Erro ao buscar StatPal:', error.message);
    console.log('   Usando ligas padrão...');
    return null;
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
  const TIER1_KEYWORDS = [
    'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
    'Liga Portugal', 'Eredivisie', 'Super Lig', 'Série A', 'Liga MX',
    'MLS', 'Superliga Argentina', 'Primeira Liga', 'Championship'
  ];

  const tier1 = {};
  const tier2 = {};
  const tier3 = {};

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
  console.log('🚀 Setup Auto Config v2 - Gerando config.json\n');

  // Tentar buscar do StatPal
  let matches = await fetchMatches();
  let usedDefault = false;

  let tier1, tier2, tier3;

  if (matches && matches.length > 0) {
    // Usar dados do StatPal
    console.log('📊 Extraindo ligas do StatPal...');
    const leagues = extractLeagues(matches);
    console.log(`✅ ${Object.keys(leagues).length} ligas encontradas!\n`);

    console.log('🎯 Categorizando ligas...');
    const categorized = categorizeLeagues(leagues);
    tier1 = categorized.tier1;
    tier2 = categorized.tier2;
    tier3 = categorized.tier3;
  } else {
    // Usar ligas DEFAULT
    console.log('📊 Usando ligas padrão (fallback)...\n');
    tier1 = DEFAULT_LEAGUES.TIER1;
    tier2 = DEFAULT_LEAGUES.TIER2;
    tier3 = DEFAULT_LEAGUES.TIER3;
    usedDefault = true;
  }

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

  if (usedDefault) {
    console.log('⚠️ Nota: Usando ligas DEFAULT. Quando tiver matches ao vivo,');
    console.log('   rode novamente pra atualizar com dados reais!\n');
  }

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
