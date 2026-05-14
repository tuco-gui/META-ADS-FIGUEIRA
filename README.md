# Meta Ads OpenAI Assistant

Backend/API em Node.js + TypeScript para operar Meta Ads por um assistente com OpenAI, sem depender de Developer Mode/MCP nativo do ChatGPT.

Fluxo:

`Usuario -> POST /chat ou REST -> OpenAI Responses API -> ferramentas internas -> Meta Marketing API`

Toda escrita exige a frase exata:

```txt
CONFIRMO ALTERAR
```

## Stack

- Node.js 20+
- TypeScript
- Express
- OpenAI Responses API
- Meta Marketing API via REST
- Zod
- dotenv
- Helmet, CORS e rate limit
- Auditoria local em `audit.log`
- Frontend simples em `/`
- Login com cookie HTTP-only para proteger rotas operacionais

## Versoes e formato de targeting

O projeto usa `META_API_VERSION=v24.0` por padrao, alinhado ao Meta Business SDK mais recente publicado no npm durante a criacao deste projeto (`facebook-nodejs-business-sdk@24.0.1`). Voce pode trocar para outra versao no `.env`.

Para travar geolocalizacao, o app:

- busca o ad set atual antes de alterar;
- preserva o objeto `targeting` existente;
- substitui somente `geo_locations` e o controle geo dentro de `targeting_automation`;
- resolve cidade por `/search?type=adgeolocation&location_types=["city"]`;
- usa `geo_locations.cities[]` com `key`, `radius` e `distance_unit` quando encontra a cidade;
- usa `geo_locations.custom_locations[]` se voce informar latitude/longitude;
- aplica `location_types: ["home", "recent"]` por padrao;
- preserva `targeting_automation.advantage_audience` se ele ja existir;
- tenta `targeting_automation.individual_setting.geo = 0` para travar geo;
- valida antes com `execution_options=["validate_only"]`;
- por padrao, se a Meta recusar `individual_setting.geo`, nenhuma alteracao e aplicada.

Fallback opcional:

```env
META_ALLOW_GEO_FALLBACK_WITHOUT_AUTOMATION=true
```

Com esse fallback, se a Meta recusar o campo de automacao geo, o app aplica somente `geo_locations/location_types`. Deixe `false` em producao se voce quer garantir que a trava de automacao foi aceita.

## Instalacao

```bash
npm install
cp .env.example .env
```

Edite o `.env`:

```env
OPENAI_API_KEY=sk-proj_xxx
OPENAI_MODEL=gpt-5.5

META_ACCESS_TOKEN=EAAB...
META_APP_ID=123456789
META_APP_SECRET=app-secret
META_API_VERSION=v24.0

ADMIN_EMAIL=sguilherme@sz4marketing.com
ADMIN_PASSWORD_HASH=scrypt:...
SESSION_SECRET=...
AUTH_COOKIE_SECURE=false

PORT=3000
CORS_ORIGIN=*
```

`META_BUSINESS_ID` e `META_AD_ACCOUNT_ID` agora são opcionais. Para multi-conta, deixe sem valor e selecione a conta no frontend ou informe `adAccountId` nas rotas.

Em produção HTTPS, use:

```env
AUTH_COOKIE_SECURE=true
```

## Permissoes Meta

O token precisa ter acesso ao Business e a conta de anuncios configurada.

Permissoes normalmente necessarias:

- `ads_read` para leitura, insights e targeting;
- `ads_management` para alterar ad sets, budget, status, nome e targeting;
- acesso de usuario/sistema ao ad account no Business Manager;
- app em modo/estado compatível com uso real e permissoes aprovadas quando aplicavel.

Para contas reais, prefira um System User token de Business Manager com permissoes minimas necessarias.

## Rodar localmente

```bash
npm run dev
```

Abra o frontend:

```bash
open http://localhost:3000
```

Build e producao:

```bash
npm run build
npm start
```

Health check:

```bash
curl http://localhost:3000/health
```

Login:

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sguilherme@sz4marketing.com","password":"SUA_SENHA"}'
```

Validar `.env` sem expor segredos:

```bash
curl -b cookies.txt http://localhost:3000/config/validate
```

Resposta esperada:

```json
{ "ok": true, "timestamp": "..." }
```

## Endpoints REST

Leitura:

```bash
curl http://localhost:3000/meta/ad-account
curl -b cookies.txt http://localhost:3000/meta/ad-accounts
curl -b cookies.txt "http://localhost:3000/meta/ad-account?adAccountId=act_123"
curl -b cookies.txt "http://localhost:3000/meta/campaigns?adAccountId=act_123"
curl http://localhost:3000/meta/campaigns
curl http://localhost:3000/meta/adsets
curl "http://localhost:3000/meta/adsets?campaignId=CAMPAIGN_ID"
curl http://localhost:3000/meta/adsets/ADSET_ID
curl http://localhost:3000/meta/adsets/ADSET_ID/targeting
curl http://localhost:3000/meta/adsets/ADSET_ID/diagnose
curl "http://localhost:3000/meta/adsets/ADSET_ID/insights?datePreset=last_30d"
curl "http://localhost:3000/meta/campaigns/CAMPAIGN_ID/insights?datePreset=last_30d"
```

Diagnosticar conjunto:

```bash
curl -X GET http://localhost:3000/meta/adsets/ADSET_ID/diagnose
```

Travar geolocalizacao:

```bash
curl -X POST http://localhost:3000/meta/adsets/ADSET_ID/lock-geo \
  -H "Content-Type: application/json" \
  -d '{
    "confirmation": "CONFIRMO ALTERAR",
    "location": {
      "name": "São Paulo",
      "radius": 20,
      "distance_unit": "kilometer",
      "country": "BR"
    }
  }'
```

Se quiser evitar busca de cidade, informe a `key` da Meta:

```json
{
  "confirmation": "CONFIRMO ALTERAR",
  "location": {
    "key": "CITY_KEY_DA_META",
    "radius": 20,
    "distance_unit": "kilometer",
    "country": "BR"
  }
}
```

Ou use coordenadas:

```json
{
  "confirmation": "CONFIRMO ALTERAR",
  "location": {
    "name": "São Paulo",
    "latitude": -23.55052,
    "longitude": -46.633308,
    "radius": 20,
    "distance_unit": "kilometer",
    "country": "BR"
  }
}
```

Pausar:

```bash
curl -X POST http://localhost:3000/meta/adsets/ADSET_ID/pause \
  -H "Content-Type: application/json" \
  -d '{ "confirmation": "CONFIRMO ALTERAR" }'
```

Ativar:

```bash
curl -X POST http://localhost:3000/meta/adsets/ADSET_ID/activate \
  -H "Content-Type: application/json" \
  -d '{ "confirmation": "CONFIRMO ALTERAR" }'
```

Alterar budget diario:

```bash
curl -X POST http://localhost:3000/meta/adsets/ADSET_ID/budget \
  -H "Content-Type: application/json" \
  -d '{
    "confirmation": "CONFIRMO ALTERAR",
    "dailyBudgetInCents": 5000
  }'
```

## Chat

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "teste-1",
    "message": "Diagnostique o conjunto de anúncios ADSET_ID e me diga se ele pode entregar fora de São Paulo."
  }'
```

Para uma alteracao via chat:

1. Peca a alteracao.
2. O assistente busca a configuracao atual.
3. O assistente retorna plano, before/after previsto e riscos.
4. Responda exatamente `CONFIRMO ALTERAR` na mesma `sessionId`.
5. O app executa e registra auditoria.

Exemplo:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "geo-1",
    "message": "Trave o conjunto ADSET_ID para São Paulo em raio de 20 km, mantendo location_types home e recent."
  }'
```

Depois:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "geo-1",
    "message": "CONFIRMO ALTERAR"
  }'
```

## Auditoria

Cada alteracao grava uma linha JSON em `audit.log`:

- `timestamp`
- `action`
- `adAccountId`
- `campaignId`, quando disponivel
- `adSetId`
- `before`
- `after`
- `context.sessionId`
- `result`
- `error`, quando houver

Chaves sensiveis como tokens e app secret sao mascaradas.

## Erros comuns

Token expirado:

- erro Meta `code=190`;
- renove `META_ACCESS_TOKEN`.

Permissao faltando:

- erro Meta `code=200` ou HTTP 403;
- revise `ads_read`, `ads_management` e acesso ao ad account.

Targeting recusado:

- a Meta pode retornar `Invalid parameter` com `blame_field=targeting`;
- revise se a campanha e categoria especial permitem o targeting;
- use `/meta/adsets/:adSetId/targeting` para inspecionar o estado atual.

## Renovar token Meta

Opcoes comuns:

- gerar novo User Access Token no Graph API Explorer para testes;
- trocar short-lived token por long-lived token;
- em producao, criar System User no Business Manager, atribuir a conta de anuncios e gerar token com `ads_read`/`ads_management`.

Depois de renovar, atualize `META_ACCESS_TOKEN` e reinicie o servidor.

## Deploy

GitHub Pages não é suficiente para este projeto completo, porque Pages só hospeda arquivos estáticos. Este app precisa de um backend Node.js para guardar variáveis de ambiente, autenticar login, chamar OpenAI e chamar Meta Marketing API. Use GitHub para o código e Render/Railway/VPS para rodar o servidor.

### Render

1. Crie um Web Service apontando para o repositorio.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Configure as variaveis de ambiente no painel.
5. Use Node 20+.
6. Em HTTPS, configure `AUTH_COOKIE_SECURE=true`.

### Railway

1. Crie projeto a partir do repositorio.
2. Configure as variaveis de ambiente.
3. Railway detecta Node; se necessario, defina:
   - build: `npm run build`
   - start: `npm start`

### VPS

```bash
git clone <repo>
cd <repo>
npm install
cp .env.example .env
npm run build
npm start
```

Para manter em background, use `pm2` ou `systemd`.

## Teste seguro recomendado

1. Comece com campanha pequena e budget baixo.
2. Rode `/meta/adsets/ADSET_ID/diagnose`.
3. Rode `/meta/adsets/ADSET_ID/targeting` e salve o retorno.
4. Use o chat para gerar plano, sem confirmar.
5. Confirme apenas se o plano mostra exatamente o ad set e o targeting esperado.
6. Confira o `audit.log` depois da alteracao.

## Comandos esperados

```bash
npm install
npm run dev
npm run build
npm start
```
