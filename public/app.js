const sessionId = `web-${crypto.randomUUID()}`;
const chatLog = document.querySelector("#chatLog");
const output = document.querySelector("#output");
const sessionBadge = document.querySelector("#sessionBadge");
const loginView = document.querySelector("#loginView");
const shell = document.querySelector(".shell");
const accountSelect = document.querySelector("#adAccountSelect");

sessionBadge.textContent = sessionId;
shell.hidden = true;

initAuth();

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  try {
    await postJson("/auth/login", { email, password });
    document.querySelector("#loginError").textContent = "";
    showApp();
    await loadAccounts();
  } catch (error) {
    document.querySelector("#loginError").textContent = "E-mail ou senha inválidos.";
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await postJson("/auth/logout", {});
  loginView.hidden = false;
  shell.hidden = true;
});

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
bind("#businessesButton", () => getJson("/meta/businesses"));
bind("#accountsButton", loadAccounts);
bind("#accountButton", () => getJson(withAdAccount("/meta/ad-account")));
bind("#campaignsButton", () => getJson(withAdAccount("/meta/campaigns")));
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
  const response = await fetch(url, { credentials: "same-origin" });
  return parseResponse(response);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });
  return parseResponse(response);
}

async function initAuth() {
  try {
    const current = await getJson("/auth/me");
    if (current.authenticated) {
      showApp();
      await loadAccounts();
    } else {
      loginView.hidden = false;
    }
  } catch {
    loginView.hidden = false;
  }
}

function showApp() {
  loginView.hidden = true;
  shell.hidden = false;
}

async function loadAccounts() {
  const result = await getJson("/meta/ad-accounts");
  accountSelect.innerHTML = '<option value="">Selecione uma conta</option>';
  for (const account of result.data ?? []) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.name ?? "Conta"} (${account.id})`;
    accountSelect.appendChild(option);
  }
  setOutput(result);
  return result;
}

function withAdAccount(path) {
  const selected = accountSelect.value;
  if (!selected) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}adAccountId=${encodeURIComponent(selected)}`;
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
