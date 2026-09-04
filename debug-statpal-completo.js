const axios = require('axios');
require('dotenv').config();

const STATPAL_API_KEY = process.env.STATPAL_API_KEY || '100a7f32-ed19-4851-8298-bf92499a7a9c';
const url = 'https://statpal.io/api/v2/soccer/matches/live';

async function debugCompleto() {
  try {
    console.log('\n🔍 DEBUG PROFUNDO - ESTRUTURA MATCHES STATPAL\n');
    
    const res = await axios.get(url, { 
      params: { access_key: STATPAL_API_KEY }, 
      timeout: 10000 
    });
    
    const matches = res.data.live_matches?.league || [];
    
    console.log(`📊 TOTAL MATCHES: ${matches.length}\n`);
    
    if (matches.length === 0) {
      console.log('❌ Nenhum match encontrado!');
      return;
    }
    
    // Analisar primeiros 5 matches
    console.log('═'.repeat(80));
    console.log('📋 ANÁLISE DOS PRIMEIROS 5 MATCHES:');
    console.log('═'.repeat(80));
    
    for (let i = 0; i < Math.min(5, matches.length); i++) {
      const match = matches[i];
      
      console.log(`\n🔹 MATCH #${i + 1}:`);
      console.log(`   ID: ${match.id}`);
      console.log(`   Status: ${match.status}`);
      console.log(`   League: ${match.league?.name || 'N/A'}`);
      console.log(`   Home: ${match.home?.name || 'N/A'} vs Away: ${match.away?.name || 'N/A'}`);
      
      // Verificar dados críticos
      console.log(`\n   📊 DADOS DISPONÍVEIS:`);
      console.log(`      • Home Stats: ${match.statistics?.home ? '✅' : '❌'}`);
      console.log(`      • Away Stats: ${match.statistics?.away ? '✅' : '❌'}`);
      console.log(`      • Odds: ${match.odds ? '✅ (' + match.odds.length + ' odds)' : '❌'}`);
      console.log(`      • Expected Goals: ${match.statistics?.home?.expected_goals ? '✅' : '❌'}`);
      
      // Mostrar odds se existirem
      if (match.odds && match.odds.length > 0) {
        console.log(`\n   💰 ODDS DISPONÍVEIS:`);
        match.odds.slice(0, 3).forEach(odd => {
          console.log(`      • ${odd.market}: ${odd.value} (bookmaker: ${odd.bookmaker})`);
        });
        if (match.odds.length > 3) {
          console.log(`      ... e mais ${match.odds.length - 3} odds`);
        }
      } else {
        console.log(`\n   💰 ODDS: ❌ NENHUMA ODD ENCONTRADA!`);
      }
      
      // Mostrar stats se existirem
      if (match.statistics?.home) {
        console.log(`\n   ⚡ STATS HOME:`);
        console.log(`      • Goals: ${match.statistics.home.goals || 0}`);
        console.log(`      • xG: ${match.statistics.home.expected_goals || 'N/A'}`);
        console.log(`      • Shots on Target: ${match.statistics.home.shots_on_target || 'N/A'}`);
        console.log(`      • Corners: ${match.statistics.home.corners || 'N/A'}`);
        console.log(`      • Yellow Cards: ${match.statistics.home.yellow_cards || 'N/A'}`);
      }
      
      console.log('\n' + '─'.repeat(80));
    }
    
    // Estatísticas gerais
    console.log('\n═'.repeat(80));
    console.log('📈 ESTATÍSTICAS GERAIS:');
    console.log('═'.repeat(80));
    
    let withOdds = 0;
    let withStats = 0;
    let withBothOddsAndStats = 0;
    
    matches.forEach(match => {
      if (match.odds && match.odds.length > 0) withOdds++;
      if (match.statistics?.home && match.statistics?.away) withStats++;
      if ((match.odds && match.odds.length > 0) && 
          (match.statistics?.home && match.statistics?.away)) {
        withBothOddsAndStats++;
      }
    });
    
    console.log(`\n✅ Matches COM odds: ${withOdds}/${matches.length} (${((withOdds/matches.length)*100).toFixed(1)}%)`);
    console.log(`✅ Matches COM stats: ${withStats}/${matches.length} (${((withStats/matches.length)*100).toFixed(1)}%)`);
    console.log(`✅ Matches COM odds E stats: ${withBothOddsAndStats}/${matches.length} (${((withBothOddsAndStats/matches.length)*100).toFixed(1)}%)`);
    console.log(`❌ Matches SEM odds: ${matches.length - withOdds}/${matches.length}`);
    console.log(`❌ Matches SEM stats: ${matches.length - withStats}/${matches.length}`);
    
    console.log('\n═'.repeat(80));
    console.log('🎯 CONCLUSÃO:');
    console.log('═'.repeat(80));
    
    if (withBothOddsAndStats === 0) {
      console.log(`\n❌ PROBLEMA ENCONTRADO: Nenhum match tem ODDS + STATS simultaneamente!`);
      console.log(`   Isso explica por que nenhuma oportunidade está sendo gerada!`);
    } else if (withBothOddsAndStats < matches.length * 0.5) {
      console.log(`\n⚠️  AVISO: Menos de 50% dos matches têm dados completos`);
      console.log(`   ${withBothOddsAndStats} matches têm dados suficientes pra processar`);
    } else {
      console.log(`\n✅ Dados parecem OK (${withBothOddsAndStats} matches processáveis)`);
      console.log(`   Problema pode estar na LÓGICA de cálculo de EV`);
    }
    
    console.log('\n');
    
  } catch (e) {
    console.error('❌ Erro:', e.message);
  }
}

debugCompleto();
