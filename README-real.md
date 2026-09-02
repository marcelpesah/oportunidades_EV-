# EV Opportunities Betting System - REAL API VERSION

Sistema automático de identificação de oportunidades de apostas com EV positivo (5%+) usando dados REAIS da Sportmonks API.

## ✨ Características

- ✅ **Dados REAIS** da Sportmonks API (estatísticas, xG, histórico)
- ✅ **Cálculo de Probabilidades** baseado em xG e estatísticas reais
- ✅ **Alertas PRÉ-LIVE** (60 min e 30 min antes do jogo)
- ✅ **Múltiplos Mercados**: Over/Under Gols, Handicap, Escanteios, Cartões
- ✅ **Telegram Bot** para receber alertas em tempo real
- ✅ **PostgreSQL** para histórico e análise
- ✅ **24/7 na Nuvem** (Railway)

## 📋 Pré-requisitos

1. **Conta Sportmonks** (FREE TRIAL ou pago)
   - API Key ativa
   - Acesso a dados de ligas principais

2. **Telegram Bot** criado e conectado

3. **Railway** com PostgreSQL ativo

4. **Node.js** 18+

## 🚀 Setup

### 1. Variáveis de Ambiente

Criar arquivo `.env`:

```
TELEGRAM_BOT_TOKEN=seu_token_aqui
TELEGRAM_USER_ID=seu_user_id_aqui
SPORTMONKS_API_KEY=sua_api_key_aqui
DATABASE_URL=postgresql://...
NODE_ENV=production
DEBUG=false
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Inicializar Banco de Dados

O sistema cria as tabelas automaticamente na primeira execução.

### 4. Executar

```bash
npm start
```

## 📊 Como Funciona

### Fluxo de Dados

1. **Sportmonks API** → Busca jogos e estatísticas reais
2. **Cálculo de EV** → Calcula probabilidades e odds
3. **Filtro** → Identifica oportunidades com EV >= 5%
4. **Telegram Alert** → Envia alertas em tempo real
5. **PostgreSQL** → Armazena histórico

### Exemplo de Alerta

```
🎯 OPORTUNIDADE EV+

⚽ Premier League
🏠 Manchester City vs Liverpool
📊 Mercado: Over 2.5 Gols
📈 Probabilidade: 65%
💰 Odd: 1.52
✅ EV: 5.3%
⏱️ Tempo: 58 min antes do jogo
```

## 📈 Ligas Monitoradas

**TIER 1** (Prioridade alta):
- Premier League (39)
- La Liga (140)
- Serie A (135)
- Bundesliga (78)
- Ligue 1 (61)
- Série A Brasil (71)
- Liga Portugal (238)
- Eredivisie (87)

**TIER 2**: Championships e segundas divisões

## 💰 Cálculos

### Probabilidade

Baseada em:
- xG (Expected Goals)
- Forma recente
- Histórico head-to-head
- Estatísticas de time

### EV (Expected Value)

```
EV = (Probabilidade × Odd) - 1

Exemplo:
EV = (0.65 × 1.52) - 1 = 0.048 = 4.8%
```

## 🔄 Schedulers

- **PRÉ-LIVE**: A cada 5 minutos
- **LIVE**: A cada 2 minutos (quando em progresso)
- **Resumo Diário**: 23:59

## 📦 Deployar no Railway

1. **Atualizar no GitHub**:
   ```bash
   git add .
   git commit -m "Upgrade para Sportmonks API real"
   git push
   ```

2. **Railway Redeploy Automático** (5-10 min)

3. **Adicionar Variável no Railway**:
   - Name: `SPORTMONKS_API_KEY`
   - Value: `sua_api_key`

## 🧪 Testes

### Ver Logs em Tempo Real

```bash
# No Railway
railway logs -f
```

### Testar Bot Manualmente

```bash
# No Telegram
/start
```

## ⚠️ Limitações Free Trial

- 2000 API calls/mês
- 5 ligas apenas
- Válido por 14 dias

Para crescer, faça upgrade para plano pago no Sportmonks.

## 🐛 Troubleshooting

### Bot não recebe alertas

1. Verificar se SPORTMONKS_API_KEY está correta
2. Ver logs: `railway logs -f`
3. Confirmar que matches estão em horário PRÉ-LIVE (-60 até -30 min)

### Erro de conexão com Sportmonks

1. Verificar se API Key é válida
2. Confirmar acesso à API (pode precisar de aprovação)
3. Verificar rate limits

### Banco de dados vazio

1. Aguardar primeiro jogo a monitorar
2. Verificar se DATABASE_URL está correta
3. Confirmar conexão PostgreSQL ativa

## 📞 Suporte

Para problemas com Sportmonks: https://sportmonks.com/api
Para problemas com Railway: https://railway.app

## 📝 Changelog

### v2.0.0 (Atual)
- ✨ Integração com Sportmonks API (REAL)
- 🎯 Cálculo de probabilidades com xG real
- 📊 Armazenamento de histórico completo
- 🔄 Schedulers para monitoramento 24/7

### v1.0.0
- Template base com dados simulados

---

**Sistema pronto para começar a gerar alertas REAIS!** 🚀
