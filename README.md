# EV Opportunities System PRO 🚀

**Sistema profissional de identificação de oportunidades de apostas com EV positivo, GREEN/RED automático, ROI tracking e suporte a múltiplas ligas.**

---

## ✨ Características PRO

- ✅ **Múltiplas Ligas**: TIER 1 + TIER 2 + TIER 3
- ✅ **GREEN/RED Automático**: Calcula resultado automaticamente
- ✅ **ROI Tracking**: Monitora lucro/prejuízo
- ✅ **Filtros Profissionais**: EV >= 5%, Odd 1.5-20
- ✅ **Relatórios Diários**: Resumo completo com estatísticas
- ✅ **Config.json**: Parâmetros editáveis sem programação
- ✅ **24/7 Automático**: Railway + Sportmonks API (REAL)

---

## 📊 Fluxo Completo

```
1. IDENTIFICA oportunidade (EV >= 5%, Odd 1.5-20)
   ↓
2. ENVIA alerta PRÉ-LIVE (60 min e 30 min)
   ↓
3. MONITORA o jogo em tempo real
   ↓
4. CALCULA resultado (busca dados do jogo)
   ↓
5. ENVIA GREEN (✅) ou RED (❌)
   ↓
6. CALCULA ROI% automático
   ↓
7. GERA relatório diário com estatísticas
```

---

## 🎯 Ligas Monitoradas

### TIER 1 (Prioridade Alta)
- Premier League
- La Liga
- Serie A
- Bundesliga
- Ligue 1
- Série A Brasil
- Liga Portugal
- Eredivisie

### TIER 2 (Segunda Divisão)
- Championship (Inglaterra)
- Segunda División (Espanha)
- Serie B (Itália)
- 2. Bundesliga (Alemanha)
- Ligue 2 (França)
- Série B (Brasil)
- Segunda Liga (Portugal)
- Eerste Divisie (Holanda)

### TIER 3 (Outras)
- Scottish Premiership
- Belgian Pro League
- Turkish Super Lig
- Greek Super League
- Swiss Super League

---

## 📋 Como Usar

### 1. Editar Parâmetros (config.json)

Arquivo `config.json` controla tudo! Abra e edite:

```json
{
  "FILTROS": {
    "EV_MINIMO": 5,           ← Mude se quiser (ex: 6, 7)
    "ODD_MINIMA": 1.5,        ← Odds mínimas (ex: 1.4, 1.6)
    "ODD_MAXIMA": 20,         ← Odds máximas (ex: 15, 25)
  },
  "LIGAS": {
    "TIER1": { ... },         ← Adicione/remova ligas
    "TIER2": { ... }
  }
}
```

### 2. Upload no GitHub

```bash
git add .
git commit -m "Upgrade para EV Opportunities PRO"
git push
```

### 3. Railway Redeploy Automático

Railway detecta e redeploy automaticamente! 🚀

---

## 🟢 Exemplo de Alerta

```
🎯 OPORTUNIDADE EV+ PRÉ-LIVE

🔴 Premier League [TIER1]
🏠 Manchester City vs Liverpool
📊 Mercado: Over 2.5 Gols
📈 Probabilidade: 65%
💰 Odd: 1.52
✅ EV: 5.3%
⏱️ Tempo: 58 min antes
```

---

## 🟢 Exemplo de Resultado GREEN

```
🟢 RESULTADO - GREEN

Premier League
Manchester City vs Liverpool
Mercado: Over 2.5 Gols
Odd apostada: 1.52
EV: 5.3%
ROI: +5.3%
```

---

## 🔴 Exemplo de Resultado RED

```
🔴 RESULTADO - RED

Premier League
Manchester City vs Liverpool
Mercado: Over 2.5 Gols
Odd apostada: 1.52
EV: 5.3%
ROI: -65.7%
```

---

## 📊 Resumo Diário

```
📊 RESUMO DIÁRIO - 02/09/2026

📈 Oportunidades identificadas: 12
✅ Oportunidades resolvidas: 8
🟢 Oportunidades lucrativas (GREEN): 5
🔴 Oportunidades no prejuízo (RED): 3
💹 Taxa de acerto: 62.5%
📊 EV médio: 6.2%
💰 ROI médio: 3.8%
💵 ROI total do dia: +30.4%
```

---

## ⚙️ Configurações Avançadas (config.json)

### Mercados Monitorados

```json
"MERCADOS": [
  "Over/Under Gols",
  "Handicap Asiático",
  "Over/Under Escanteios",
  "Over/Under Cartões",
  "Primeiro Gol",
  "Resultado Exato"
]
```

### Schedulers (Frequência de Verificação)

```json
"SCHEDULERS": {
  "PRE_LIVE_INTERVALO_MIN": 5,      ← Verificar a cada 5 min
  "LIVE_INTERVALO_MIN": 2,           ← Verificar a cada 2 min (durante jogo)
  "RESULTADO_CHECK_INTERVALO_MIN": 5, ← Verificar resultado a cada 5 min
  "RESUMO_DIARIO_HORA": 23,          ← Resumo às 23:59
  "RESUMO_DIARIO_MINUTO": 59
}
```

### Notificações

```json
"NOTIFICACOES": {
  "ENVIAR_PRELIVE": true,           ← Alertas PRÉ-LIVE
  "ENVIAR_LIVE": true,              ← Alertas LIVE
  "ENVIAR_RESULTADO": true,         ← GREEN/RED
  "ENVIAR_RESUMO_DIARIO": true      ← Resumo diário
}
```

---

## 🔍 Monitorar em Tempo Real

```bash
# Ver logs ao vivo no Railway
railway logs -f

# Procurar por "PRÉ-LIVE"
railway logs -f | grep "PRÉ-LIVE"

# Procurar por "resultado"
railway logs -f | grep "resultado"
```

---

## 💡 Dicas Profissionais

### 1. Ajustar Odds Mínima

Se muitos alertas não chegam a GREEN, **aumente a Odd Mínima**:
```json
"ODD_MINIMA": 1.5  →  1.6 ou 1.7
```

Se muito poucas oportunidades, **diminua**:
```json
"ODD_MINIMA": 1.5  →  1.4 ou 1.3
```

### 2. Ajustar EV Mínimo

Se o ROI é baixo, **aumente EV**:
```json
"EV_MINIMO": 5  →  6 ou 7
```

Se poucos alertas, **diminua**:
```json
"EV_MINIMO": 5  →  4 ou 3
```

### 3. Monitorar ROI Diário

Analise o **ROI total do dia**! Se negativo por 3 dias:
- Aumentar EV mínimo
- Aumentar Odd mínima
- Remover ligas com baixo retorno

---

## 🚨 Troubleshooting

### Bot não envia GREEN/RED

1. Verificar se jogo foi marcado como FINISHED no Sportmonks
2. Ver logs: `railway logs -f | grep "resultado"`
3. Aguardar 5-10 min após o jogo terminar

### Alertas chegam mas ROI fica em -100%

1. Probabilidade calculada estava errada
2. Aumentar EV mínimo pra próximas vezes
3. Analisar que mercados/ligas funcionam melhor

### Nenhum alerta sendo enviado

1. Verificar se há jogos nas ligas configuradas
2. Verificar filtros: Odd mínima não está muito alta?
3. Ver logs de erro

---

## 📈 Análise de Dados

### Acessar banco de dados

```sql
-- Ver todas as oportunidades do dia
SELECT * FROM opportunities 
WHERE DATE(created_at) = CURRENT_DATE;

-- Ver GREEN/RED breakdown
SELECT green_red, COUNT(*) as count, AVG(roi_percentage) as avg_roi
FROM opportunities
WHERE status = 'RESOLVED' AND DATE(created_at) = CURRENT_DATE
GROUP BY green_red;

-- Ver ROI por liga
SELECT league, AVG(roi_percentage) as avg_roi, COUNT(*) as count
FROM opportunities
WHERE status = 'RESOLVED' AND DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY league
ORDER BY avg_roi DESC;

-- Ver ROI por mercado
SELECT market, AVG(roi_percentage) as avg_roi, COUNT(*) as count
FROM opportunities
WHERE status = 'RESOLVED' AND DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY market
ORDER BY avg_roi DESC;
```

---

## 🎯 Próximos Passos

1. **Monitor 14 dias** (Free Trial Sportmonks) e analise ROI
2. **Ajuste parâmetros** baseado nos resultados
3. **Decida qual upgrade** fazer no Sportmonks (Starter €29 ou Growth €99)
4. **Scale up** com mais ligas/mercados

---

## 📞 Suporte

- Sportmonks API: https://sportmonks.com/api
- Railway Logs: `railway logs -f`
- GitHub: Push commit com novas configs

---

**Sistema PRO pronto para lucrar! 🚀💰**
