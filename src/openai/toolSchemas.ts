export const openAiTools: any[] = [
  {
    type: "function",
    name: "listBusinesses",
    description: "Lista Business Managers acessiveis pelo token Meta configurado.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    type: "function",
    name: "listAdAccounts",
    description: "Lista todas as contas de anuncios acessiveis pelo token Meta configurado.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    type: "function",
    name: "findAdAccounts",
    description: "Pesquisa contas de anuncios pelo nome ou ID. Use quando o usuario disser algo como conta Ortega, CA Ortega, Figueira etc.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "setActiveAdAccount",
    description: "Define a conta de anuncios ativa da sessao de chat.",
    parameters: {
      type: "object",
      properties: { adAccountId: { type: "string" } },
      required: ["adAccountId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "getAdAccount",
    description: "Consulta dados basicos da conta de anuncios Meta selecionada ou informada.",
    parameters: {
      type: "object",
      properties: { adAccountId: { type: "string" } },
      required: [],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "listCampaigns",
    description: "Lista campanhas da conta de anuncios Meta.",
    parameters: {
      type: "object",
      properties: { adAccountId: { type: "string" } },
      required: [],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "analyzeCampaign",
    description: "Analisa uma campanha inteira: campanha, conjuntos, anuncios, insights, alertas e sugestoes. Use para ID de campanha.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string" },
        datePreset: { type: "string", default: "last_30d" }
      },
      required: ["campaignId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "listAdSets",
    description: "Lista conjuntos de anuncios. Pode filtrar por campaignId.",
    parameters: {
      type: "object",
      properties: { campaignId: { type: "string" }, adAccountId: { type: "string" } },
      required: [],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "getAdSet",
    description: "Consulta detalhes de um conjunto de anuncios.",
    parameters: {
      type: "object",
      properties: { adSetId: { type: "string" } },
      required: ["adSetId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "getAdSetTargeting",
    description: "Consulta apenas o targeting de um conjunto de anuncios.",
    parameters: {
      type: "object",
      properties: { adSetId: { type: "string" } },
      required: ["adSetId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "getAdSetInsights",
    description: "Consulta insights de um conjunto de anuncios por date_preset.",
    parameters: {
      type: "object",
      properties: {
        adSetId: { type: "string" },
        datePreset: { type: "string", default: "last_30d" }
      },
      required: ["adSetId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "getCampaignInsights",
    description: "Consulta insights de uma campanha por date_preset.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string" },
        datePreset: { type: "string", default: "last_30d" }
      },
      required: ["campaignId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "diagnoseAdSetTargeting",
    description: "Diagnostica geolocalizacao, location_types, Advantage Audience e riscos de expansao de um ad set.",
    parameters: {
      type: "object",
      properties: { adSetId: { type: "string" } },
      required: ["adSetId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "lockAdSetGeoTargeting",
    description: "Gera plano para travar geolocalizacao de um ad set. Nunca executa sem confirmacao humana exata.",
    parameters: {
      type: "object",
      properties: {
        adSetId: { type: "string" },
        location: {
          type: "object",
          properties: {
            name: { type: "string" },
            key: { type: "string" },
            latitude: { type: "number" },
            longitude: { type: "number" },
            radius: { type: "number" },
            distance_unit: { type: "string", enum: ["kilometer", "mile"], default: "kilometer" },
            country: { type: "string" },
            location_types: {
              type: "array",
              items: { type: "string", enum: ["home", "recent"] }
            }
          },
          required: ["radius", "distance_unit"],
          additionalProperties: false
        }
      },
      required: ["adSetId", "location"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "pauseAdSet",
    description: "Gera plano para pausar um conjunto de anuncios. Exige confirmacao.",
    parameters: {
      type: "object",
      properties: { adSetId: { type: "string" } },
      required: ["adSetId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "activateAdSet",
    description: "Gera plano para ativar um conjunto de anuncios. Exige confirmacao.",
    parameters: {
      type: "object",
      properties: { adSetId: { type: "string" } },
      required: ["adSetId"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "updateAdSetDailyBudget",
    description: "Gera plano para alterar orcamento diario em centavos. Exige confirmacao.",
    parameters: {
      type: "object",
      properties: {
        adSetId: { type: "string" },
        dailyBudgetInCents: { type: "integer", minimum: 1 }
      },
      required: ["adSetId", "dailyBudgetInCents"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "updateAdSetTargeting",
    description: "Gera plano para aplicar patch de targeting. O app mescla o patch no targeting atual e valida antes de escrever.",
    parameters: {
      type: "object",
      properties: {
        adSetId: { type: "string" },
        targetingPatch: { type: "object", additionalProperties: true }
      },
      required: ["adSetId", "targetingPatch"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "updateAdSetName",
    description: "Gera plano para renomear conjunto de anuncios. Exige confirmacao.",
    parameters: {
      type: "object",
      properties: {
        adSetId: { type: "string" },
        newName: { type: "string" }
      },
      required: ["adSetId", "newName"],
      additionalProperties: false
    }
  }
];
