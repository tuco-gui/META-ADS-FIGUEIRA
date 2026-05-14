const sessionId = `web-${crypto.randomUUID()}`;
const chatLog = document.querySelector("#chatLog");
const output = document.querySelector("#output");
const sessionBadge = document.querySelector("#sessionBadge");

sessionBadge.textContent = sessionId;

document.querySelector("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#message");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  appendMessage("user", message);
  const result = await postJson("/chat", { sessionId, message });
  appendMessage("assistant", result.message ?? JSON.stringify(result, null, 2));
});

bind("#healthButton", () => getJson("/health"));
bind("#configButton", () => getJson("/config/validate"));
bind("#accountButton", () => getJson("/meta/ad-account"));
bind("#campaignsButton", () => getJson("/meta/campaigns"));
bind("#adSetButton", () => getJson(`/meta/adsets/${adSetId()}`));
bind("#targetingButton", () => getJson(`/meta/adsets/${adSetId()}/targeting`));
bind("#diagnoseButton", () => getJson(`/meta/adsets/${adSetId()}/diagnose`));

function bind(selector, handler) {
  document.querySelector(selector).addEventListener("click", async () => {
    try {
      setOutput(await handler());
    } catch (error) {
      setOutput({ error: error.message });
    }
  });
}

function adSetId() {
  const value = document.querySelector("#adSetId").value.trim();
  if (!value) throw new Error("Informe um Ad set ID.");
  return encodeURIComponent(value);
}

async function getJson(url) {
  const response = await fetch(url);
  return parseResponse(response);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(JSON.stringify(data, null, 2));
  }
  return data;
}

function setOutput(value) {
  output.textContent = JSON.stringify(value, null, 2);
}

function appendMessage(role, text) {
  const node = document.createElement("p");
  node.className = `msg ${role}`;
  node.textContent = text;
  chatLog.appendChild(node);
  chatLog.scrollTop = chatLog.scrollHeight;
}
