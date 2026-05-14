export const openAiTools: any[] = [
  {
    type: "function",
    name: "getAdAccount",
    description: "Consulta dados básicos da conta de anúncios Meta configurada.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    type: "function",
    name: "listCampaigns",
    description: "Lista campanhas da conta de anúncios Meta.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    type: "function",
    name: "listAdSets",
    description: "Lista conjuntos de anúncios. Pode filtrar por campaignId.",
    parameters: {
      type: "object",
      properties: { campaignId: { type: "string" } },
      required: [],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "getAdSet",
    description: "Consulta detalhes de um conjunto de anúncios.",
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
    description: "Consulta apenas o targeting de um conjunto de anúncios.",
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
    description: "Consulta insights de um conjunto de anúncios por date_preset.",
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
    description:
      "Diagnostica geolocalização, location_types, Advantage Audience e riscos de expansão de um ad set.",
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
    description:
      "Gera plano para travar geolocalização de um ad set. Nunca executa sem confirmação humana exata.",
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
    description: "Gera plano para pausar um conjunto de anúncios. Exige confirmação.",
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
    description: "Gera plano para ativar um conjunto de anúncios. Exige confirmação.",
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
    description: "Gera plano para alterar orçamento diário em centavos. Exige confirmação.",
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
    description:
      "Gera plano para aplicar patch de targeting. O app mescla o patch no targeting atual e valida antes de escrever.",
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
    description: "Gera plano para renomear conjunto de anúncios. Exige confirmação.",
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
