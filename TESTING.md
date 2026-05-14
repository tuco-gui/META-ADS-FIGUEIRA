# Roteiro de Teste

Este roteiro testa o app localmente na ordem combinada.

Antes de comecar:

```bash
cp .env.example .env
```

Preencha o `.env` com seus valores reais, sem aspas:

```env
OPENAI_API_KEY=...
META_ACCESS_TOKEN=...
META_APP_ID=...
META_APP_SECRET=...
META_BUSINESS_ID=...
META_AD_ACCOUNT_ID=act_...
META_API_VERSION=v24.0
PORT=3000
```

Suba o servidor:

```bash
npm install
npm run dev
```

Em outro Terminal, defina variaveis para os testes:

```bash
export BASE_URL="http://localhost:3000"
export ADSET_ID="COLOQUE_UM_ADSET_ID_REAL_AQUI"
```

Opcional, mas recomendado para ler JSON melhor:

```bash
brew install jq
```

## 1. Verificar /health

```bash
curl -sS "$BASE_URL/health" | jq
```

Sem `jq`:

```bash
curl -sS "$BASE_URL/health"
```

Resultado esperado:

```json
{
  "ok": true,
  "timestamp": "..."
}
```

## 2. Verificar variaveis .env

Este endpoint nao retorna tokens nem secrets. Ele mostra apenas presenca e alguns valores nao sensiveis.

```bash
curl -sS "$BASE_URL/config/validate" | jq
```

Verifique se:

- `openai.apiKeyPresent` esta `true`
- `meta.accessTokenPresent` esta `true`
- `meta.appIdPresent` esta `true`
- `meta.appSecretPresent` esta `true`
- `meta.businessIdPresent` esta `true`
- `meta.adAccountId` aparece mascarado
- `meta.apiVersion` esta correta

## 3. Listar conta de anuncios

```bash
curl -sS "$BASE_URL/meta/ad-account" | jq
```

Resultado esperado:

- `id` da conta
- `name`
- `account_status`
- `currency`

Se retornar erro `code=190`, o token expirou ou esta invalido.

Se retornar erro de permissao, revise `ads_read`, `ads_management` e acesso da conta no Business Manager.

## 4. Listar campanhas

```bash
curl -sS "$BASE_URL/meta/campaigns" | jq
```

Resultado esperado:

```json
{
  "data": [
    {
      "id": "...",
      "name": "...",
      "status": "...",
      "objective": "..."
    }
  ]
}
```

## 5. Listar conjuntos

```bash
curl -sS "$BASE_URL/meta/adsets" | jq
```

Para filtrar por campanha:

```bash
export CAMPAIGN_ID="COLOQUE_UM_CAMPAIGN_ID_REAL_AQUI"
curl -sS "$BASE_URL/meta/adsets?campaignId=$CAMPAIGN_ID" | jq
```

Escolha um `id` de ad set retornado e atualize:

```bash
export ADSET_ID="ADSET_ID_REAL"
```

## 6. Buscar um conjunto especifico

```bash
curl -sS "$BASE_URL/meta/adsets/$ADSET_ID" | jq
```

Resultado esperado:

- `id`
- `name`
- `status`
- `campaign_id`
- `targeting`

## 7. Diagnosticar targeting

```bash
curl -sS "$BASE_URL/meta/adsets/$ADSET_ID/diagnose" | jq
```

Resultado esperado:

- `adSetName`
- `adSetId`
- `status`
- `campaign`
- `locations`
- `radius`
- `location_types`
- `targeting_automation`
- `advantageAudienceActive`
- `geoLocked`
- `geoExpandable`
- `diagnostic`
- `risks`
- `recommendation`

## 8. Simular alteracao sem confirmacao e garantir que bloqueia

Este comando omite `confirmation` de proposito. Deve retornar HTTP 400.

```bash
curl -i -sS -X POST "$BASE_URL/meta/adsets/$ADSET_ID/lock-geo" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "name": "São Paulo",
      "radius": 20,
      "distance_unit": "kilometer",
      "country": "BR"
    }
  }'
```

Resultado esperado:

- status HTTP `400`
- corpo com `error: "validation_error"`
- nenhuma alteracao executada

Tambem teste via chat. Esta chamada deve gerar plano e pedir confirmacao, sem executar:

```bash
curl -sS -X POST "$BASE_URL/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"teste-lock-geo\",
    \"message\": \"Trave o conjunto $ADSET_ID para São Paulo em raio de 20 km, mantendo home e recent.\"
  }" | jq
```

Resultado esperado:

- resposta com plano
- pedido da frase exata `CONFIRMO ALTERAR`
- nenhuma escrita ainda

## 9. Fazer alteracao com confirmacao

Atencao: este comando altera um conjunto real.

```bash
curl -sS -X POST "$BASE_URL/meta/adsets/$ADSET_ID/lock-geo" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmation": "CONFIRMO ALTERAR",
    "location": {
      "name": "São Paulo",
      "radius": 20,
      "distance_unit": "kilometer",
      "country": "BR"
    }
  }' | tee /tmp/meta-lock-geo-response.json | jq
```

Alternativa via chat, depois de gerar o plano no passo 8:

```bash
curl -sS -X POST "$BASE_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "teste-lock-geo",
    "message": "CONFIRMO ALTERAR"
  }' | tee /tmp/meta-chat-confirm-response.json | jq
```

Resultado esperado:

- resposta com `before`
- resposta com `after`
- `after.targeting.geo_locations` configurado para a localizacao desejada

## 10. Conferir before/after

Se voce usou o endpoint REST no passo 9:

```bash
jq '.before.targeting.geo_locations, .after.targeting.geo_locations' /tmp/meta-lock-geo-response.json
jq '.before.targeting.targeting_automation, .after.targeting.targeting_automation' /tmp/meta-lock-geo-response.json
```

Se voce usou o chat no passo 9:

```bash
jq '.result.before.targeting.geo_locations, .result.after.targeting.geo_locations' /tmp/meta-chat-confirm-response.json
jq '.result.before.targeting.targeting_automation, .result.after.targeting.targeting_automation' /tmp/meta-chat-confirm-response.json
```

Confirme tambem consultando a API depois da alteracao:

```bash
curl -sS "$BASE_URL/meta/adsets/$ADSET_ID/targeting" | jq
```

## 11. Conferir audit.log

Veja as ultimas linhas da auditoria:

```bash
tail -n 20 audit.log
```

Com `jq`, uma linha por evento:

```bash
tail -n 20 audit.log | jq
```

Confira se o evento da alteracao tem:

- `timestamp`
- `action`
- `adAccountId`
- `campaignId`, quando disponivel
- `adSetId`
- `before`
- `after`
- `context.sessionId`
- `result: "success"`

## Testar frontend

Com o servidor rodando, abra:

```bash
open "$BASE_URL"
```

A tela permite:

- validar health
- validar `.env`
- consultar conta/campanhas
- buscar ad set
- consultar targeting
- diagnosticar targeting
- usar o chat operacional
