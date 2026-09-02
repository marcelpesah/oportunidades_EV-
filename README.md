# 🎯 EV Opportunities Betting System

Sistema inteligente de identificação de oportunidades de apostas com **EV >= 5%** usando múltiplas fontes de dados, odds em tempo real e alertas via Telegram.

## ⚙️ Features

✅ **Coleta Multi-Fonte**
- SofaScore (estatísticas em tempo real)
- Sportmonks (dados avançados)
- Betfair/Pinnacle (odds premium)
- Casas convencionais (Bet365, William Hill, Unibet)

✅ **Alertas Inteligentes**
- PRÉ-LIVE: 60 min + 30 min antes do jogo
- LIVE: Detecta oportunidades durante o jogo
- LIVE Cutoffs: HT até min 35, FT até min 75-80
- Segmentação por Tier de liga

✅ **Cálculo EV Automático**
- Probabilidade baseada em: xG, forma, histórico, árbitro, liga
- Odd mínima calculada automaticamente
- Filtros de EV positivo

✅ **Histórico & Análise**
- PostgreSQL com histórico completo
- Resumos diários automáticos
- Análise por mercado e liga

---

## 🚀 Quick Start (Railway)

### Passo 1: Criar Repositório GitHub

```bash
# Clone este repo
git clone <seu-repo>
cd ev-opportunities-system

# Setup inicial
npm install

# Copiar .env
cp .env.example .env
```

### Passo 2: Railway Setup (5 minutos)

1. Acesse **railway.app** e crie uma conta
2. Clique em **"New Project"** → **"Deploy from GitHub"**
3. Conecte seu repo GitHub
4. Railway vai detectar `package.json` automaticamente

### Passo 3: Variáveis de Ambiente

No Railway Dashboard:
1. Vá para seu projeto
2. Clique em **"Variables"**
3. Adicione as variáveis do `.env.example`:

```
TELEGRAM_BOT_TOKEN = 8970126309:AAGd1fzqAhy0kVkFjf-LGyEcvFk6dSe4RjU
TELEGRAM_USER_ID = 6406325412
DATABASE_URL = [Railway gera automaticamente após adicionar PostgreSQL]
NODE_ENV = production
```

### Passo 4: Adicionar PostgreSQL (Railway)

1. No Railway Dashboard, clique **"New Service"** → **"PostgreSQL"**
2. Railway vai **automaticamente** adicionar `DATABASE_URL` nas variáveis
3. Pronto! Sistema está ready

### Passo 5: Deploy

1. Clique **"Deploy"** no Railway
2. Sistema roda 24/7 automaticamente
3. Logs disponíveis em tempo real

---

## 📊 Como Funciona

### Timeline de Alertas

```
13:00 → Alerta PRÉ-LIVE (60 min antes)
        "Manchester United vs Liverpool | Over 2.5 Gols | EV: 6.8%"

13:30 → Alerta PRÉ-LIVE (30 min antes)
        "CONFIRMAÇÃO: Odd subiu! EV agora 7.1%"

14:00 → Jogo começa
        Sistema monitora em LIVE

14:32 → Alerta LIVE (se houver entrada)
        "NOVA ENTRADA LIVE: Over 1.5 (2H) | EV: 8.2%"

23:59 → Resumo diário
        "GREEN: 11 | RED: 6 | ROI: +43.5%"
```

### Mercados Monitorados

```
PRÉ-LIVE:
├─ Over/Under Gols (HT e FT)
├─ Over/Under Cartões (FT)
├─ Over/Under Escanteios (FT)
└─ Handicap Asiático

LIVE:
├─ Over/Under (com confirmação real)
├─ Ambas Marcam
└─ Dinâmico (conforme jogo avança)
```

### Ligas Monitoradas

**TIER 1 (Máxima prioridade):**
- Premier League (Inglaterra)
- La Liga (Espanha)
- Serie A (Itália)
- Bundesliga (Alemanha)
- Ligue 1 (França)
- Série A (Brasil)
- Liga Portugal
- Eredivisie (Holanda)

**TIER 2 (Média prioridade):**
- Championship, Segunda divisões, etc

**TIER 3 (Monitora, alert agrupado):**
- Terceiras divisões, ligas menores

---

## 📱 Telegram Setup

### Criar Bot (se ainda não fez)

1. Abra Telegram e procure `@BotFather`
2. Envie `/newbot`
3. Dê um nome: `"EV Opportunities Bot"`
4. BotFather retorna seu **TOKEN** (guarde!)

### Descobrir seu User ID

1. Procure `@userinfobot`
2. Envie `/start`
3. Ele retorna seu **User ID** (número)

### Teste de Conexão

Sistema envia teste automático ao iniciar. Verifique seu Telegram se recebeu mensagem de confirmação.

---

## 🔧 Configurações Customizáveis

Edite em `ev-opportunities-system.js` (seção CONFIG):

```javascript
alerts: {
  preLive60min: true,        // Alerta 60 min antes?
  preLive30min: true,        // Alerta 30 min antes?
  liveHtLimit: 35,           // Limite LIVE para 1T (minutos)
  liveFtLimit: 80,           // Limite LIVE para 2T (minutos)
  minEv: 0.05,              // Mínimo EV (5% = 0.05)
}
```

---

## 📊 Banco de Dados

Sistema usa **PostgreSQL** com 3 tabelas principais:

### `opportunities`
- Todas as oportunidades identificadas
- Status: pending, resolved
- Resultado: green, red
- Profit tracking

### `team_stats`
- Médias por time/liga
- Goals, cartões, escanteios, forma

### `daily_summary`
- Resumo diário automático
- Win rate, ROI, análise por mercado

---

## 🚨 Troubleshooting

### Telegram não recebe alertas

```bash
# Verificar variáveis
- TOKEN correto? (Copiar exatamente do BotFather)
- USER_ID correto? (@userinfobot)
- Bot iniciou? (Verificar logs no Railway)
```

### Nenhuma oportunidade identificada

```bash
# Possíveis razões:
- Fora do horário de jogos
- EV realmente abaixo de 5% (mercado eficiente)
- API de dados offline (verificar logs)
- Ligas pequenas com dados insuficientes
```

### Database error

```bash
# Railway fornece PostgreSQL automaticamente
- Se erro, verifique DATABASE_URL em Variables
- Deve ter formato: postgresql://...
```

---

## 📈 Monitoramento

Railway Dashboard fornece:
- **Logs em tempo real** (tudo que o sistema faz)
- **CPU/Memória/Bandwidth** (recursos)
- **Deploy history** (versões anteriores)

Acesse: `railway.app` → seu projeto → logs

---

## 💡 Próximas Melhorias

- [ ] Integração direta com Betfair/Pinnacle API
- [ ] Machine Learning pra refinar probabilidades
- [ ] Dashboard web com histórico
- [ ] Notificações por liga/mercado customizáveis
- [ ] Export CSV para análise
- [ ] Suporte multi-moeda

---

## ⚖️ Disclaimer

Este sistema é **educacional**. Use por sua conta e risco. Apostas envolvem risco de perda. Sempre valide seus cálculos de EV.

---

## 🤝 Suporte

Sistema está pronto! Qualquer dúvida sobre deployment no Railway, me avise.

**Boa sorte nas apostas!** 🚀
