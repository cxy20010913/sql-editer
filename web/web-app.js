(function () {
  /** @type {{ id: string, label: string }[]} */
  const PROVIDERS = [
    { id: "zhipu", label: "智谱 GLM" },
    { id: "qwen", label: "通义千问 Qwen" },
    { id: "deepseek", label: "DeepSeek" },
    { id: "kimi", label: "Kimi（月之暗面 Moonshot）" },
    { id: "minimax", label: "MiniMax" },
    { id: "doubao", label: "字节豆包 · 火山方舟" },
  ];

  /** 与扩展中的 MODEL_CATALOG / baseUrlForProvider 保持一致（复制过来避免前后端强依赖） */
  const MODEL_CATALOG = {
    zhipu: [
      { id: "glm-5.1", label: "GLM-5.1（最新）" },
      { id: "glm-4.7-flash", label: "GLM-4.7-Flash（旗舰轻量）" },
      { id: "glm-4.7", label: "GLM-4.7" },
      { id: "glm-4.6", label: "GLM-4.6" },
      { id: "glm-4.5-air", label: "GLM-4.5-Air" },
      { id: "glm-4.5", label: "GLM-4.5" },
      { id: "glm-4-flash", label: "GLM-4-Flash" },
      { id: "glm-4-plus", label: "GLM-4-Plus" },
      { id: "glm-4", label: "GLM-4" },
      { id: "glm-z1-flash", label: "GLM-Z1-Flash（推理）" },
      { id: "glm-3-turbo", label: "GLM-3-Turbo" },
    ],
    qwen: [
      { id: "qwen3-max", label: "Qwen3-Max（旗舰）" },
      { id: "qwen3.6-plus", label: "Qwen3.6-Plus" },
      { id: "qwen3.5-plus", label: "Qwen3.5-Plus" },
      { id: "qwen3.5-flash", label: "Qwen3.5-Flash" },
      { id: "qwen-plus", label: "Qwen-Plus" },
      { id: "qwen-flash", label: "Qwen-Flash" },
      { id: "qwen-turbo", label: "Qwen-Turbo" },
    ],
    deepseek: [
      { id: "deepseek-chat", label: "deepseek-chat（V3.2 对话）" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner（V3.2 思考）" },
      { id: "deepseek-coder", label: "DeepSeek-Coder" },
    ],
    kimi: [
      { id: "kimi-k2.5", label: "Kimi K2.5" },
      { id: "kimi-k2-thinking", label: "Kimi K2 Thinking" },
      { id: "kimi-k2", label: "Kimi K2" },
      { id: "moonshot-v1-128k", label: "Moonshot 128K" },
      { id: "moonshot-v1-32k", label: "Moonshot 32K" },
      { id: "moonshot-v1-8k", label: "Moonshot 8K" },
      { id: "moonshot-v1-auto", label: "Moonshot Auto" },
    ],
    minimax: [
      { id: "minimax-m2.7", label: "MiniMax-M2.7" },
      { id: "minimax-m2.7-highspeed", label: "MiniMax-M2.7-Highspeed" },
      { id: "minimax-m2.5", label: "MiniMax-M2.5" },
      { id: "abab6.5s-chat", label: "abab6.5s-chat" },
      { id: "abab6.5t-chat", label: "abab6.5t-chat" },
      { id: "abab6.5g-chat", label: "abab6.5g-chat" },
      { id: "abab6.5-chat", label: "abab6.5-chat" },
      { id: "abab6-chat", label: "abab6-chat" },
    ],
    doubao: [
      { id: "doubao-pro-32k", label: "豆包 Pro 32K" },
      { id: "doubao-pro-256k", label: "豆包 Pro 256K" },
      { id: "doubao-lite-32k", label: "豆包 Lite 32K" },
      { id: "doubao-lite-4k", label: "豆包 Lite 4K" },
      { id: "doubao-seed-1-6-250615", label: "Doubao-Seed-1.6（示例）" },
      { id: "deepseek-v3-250324", label: "DeepSeek-V3（方舟示例）" },
    ],
  };

  function baseUrlForProvider(id) {
    switch (id) {
      case "zhipu":
        return "https://open.bigmodel.cn/api/paas/v4";
      case "qwen":
        return "https://dashscope.aliyuncs.com/compatible-mode/v1";
      case "deepseek":
        return "https://api.deepseek.com";
      case "kimi":
        return "https://api.moonshot.cn/v1";
      case "minimax":
        return "https://api.minimax.chat/v1";
      case "doubao":
        return "https://ark.cn-beijing.volces.com/api/v3";
      default:
        return "";
    }
  }

  const els = {
    provider: document.getElementById("provider"),
    apiBaseUrl: document.getElementById("apiBaseUrl"),
    model: document.getElementById("model"),
    apiKey: document.getElementById("apiKey"),
    dialect: document.getElementById("dialect"),
    temperature: document.getElementById("temperature"),
    userGoal: document.getElementById("userGoal"),
    tables: document.getElementById("tables"),
    addTable: document.getElementById("addTable"),
    generate: document.getElementById("generate"),
    abort: document.getElementById("abort"),
    output: document.getElementById("output"),
    toast: document.getElementById("toast"),
  };

  let controller = null;

  function showToast(msg) {
    const t = els.toast;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function parseFields(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((line) => {
      let name = line;
      let comment = "";
      const colon = line.indexOf(":");
      const pipe = line.indexOf("|");
      const tab = line.indexOf("\t");
      if (colon !== -1 && (pipe === -1 || colon < pipe) && (tab === -1 || colon < tab)) {
        name = line.slice(0, colon).trim();
        comment = line.slice(colon + 1).trim();
      } else if (pipe !== -1) {
        name = line.slice(0, pipe).trim();
        comment = line.slice(pipe + 1).trim();
      } else if (tab !== -1) {
        name = line.slice(0, tab).trim();
        comment = line.slice(tab + 1).trim();
      }
      return { name, comment };
    });
  }

  function parseTargets(text) {
    return text
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let tableIndex = 0;

  function escAttr(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function escText(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
  }

  function addTableBlock(data) {
    const id = ++tableIndex;
    const wrap = document.createElement("div");
    wrap.className = "table-block";
    wrap.dataset.id = String(id);
    wrap.innerHTML = `
      <header>
        <span>表块 #${id}</span>
        <button type="button" class="small secondary remove-table">移除</button>
      </header>
      <label>基础表名</label>
      <input type="text" class="base-table" placeholder="例如 orders" value="${escAttr(
        data?.baseTable
      )}" />
      <label>字段（每行：字段名: 注释，也支持 字段名|注释 或 字段名\\t注释）</label>
      <textarea class="fields" rows="5" placeholder="order_id: 订单主键&#10;user_id: 用户">${escText(
        data?.fieldsText
      )}</textarea>
      <label>目标字段（逗号分隔列名或业务约束短语）</label>
      <input type="text" class="targets" placeholder="user_id, total_amount" value="${escAttr(
        data?.targetsText
      )}" />
    `;
    wrap.querySelector(".remove-table").addEventListener("click", () => wrap.remove());
    els.tables.appendChild(wrap);
  }

  function ensureOneTable() {
    if (!els.tables.querySelector(".table-block")) {
      addTableBlock({});
    }
  }

  function collectPayload() {
    ensureOneTable();
    const blocks = Array.from(els.tables.querySelectorAll(".table-block"));
    const tables = blocks.map((block) => {
      const baseTable = /** @type {HTMLInputElement} */ (
        block.querySelector(".base-table")
      ).value.trim();
      const fieldsText = /** @type {HTMLTextAreaElement} */ (
        block.querySelector(".fields")
      ).value;
      const targetsText = /** @type {HTMLInputElement} */ (
        block.querySelector(".targets")
      ).value;
      return {
        baseTable,
        fields: parseFields(fieldsText),
        targets: parseTargets(targetsText),
      };
    });
    return {
      dialect: els.dialect.value,
      userGoal: els.userGoal.value,
      tables,
      temperature: Number(els.temperature.value),
    };
  }

  function refreshModelSelect() {
    const pid = els.provider.value || "deepseek";
    const list = MODEL_CATALOG[pid] || [];
    const current = els.model.value;
    els.model.innerHTML = "";
    for (const m of list) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      els.model.appendChild(opt);
    }
    if (current && list.some((m) => m.id === current)) {
      els.model.value = current;
    }
  }

  function onProviderChange() {
    const pid = els.provider.value;
    els.apiBaseUrl.value = baseUrlForProvider(pid);
    refreshModelSelect();
  }

  async function onGenerate() {
    const apiKey = els.apiKey.value.trim();
    const apiBaseUrl = els.apiBaseUrl.value.trim();
    const model = els.model.value.trim();
    if (!apiKey) {
      showToast("请先填写 API Key。");
      return;
    }
    if (!apiBaseUrl) {
      showToast("请先填写 API Base URL。");
      return;
    }
    if (!model) {
      showToast("请选择模型。");
      return;
    }

    const payload = collectPayload();
    els.generate.disabled = true;
    els.abort.disabled = false;
    els.output.textContent = "";
    controller = new AbortController();

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          apiBaseUrl,
          apiKey,
          model,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        els.output.textContent = "错误: " + data.error;
      } else {
        els.output.textContent = data.sql || "";
      }
    } catch (e) {
      if (e.name === "AbortError") {
        els.output.textContent = "已中止生成。";
      } else {
        els.output.textContent = "错误: " + (e.message || String(e));
      }
    } finally {
      els.generate.disabled = false;
      els.abort.disabled = true;
      controller = null;
    }
  }

  function onAbort() {
    if (controller) {
      controller.abort();
    }
  }

  // init
  (function init() {
    for (const p of PROVIDERS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      els.provider.appendChild(opt);
    }
    els.provider.value = "deepseek";
    els.apiBaseUrl.value = baseUrlForProvider("deepseek");
    refreshModelSelect();
    ensureOneTable();

    els.provider.addEventListener("change", onProviderChange);
    els.addTable.addEventListener("click", () => addTableBlock({}));
    els.generate.addEventListener("click", () => void onGenerate());
    els.abort.addEventListener("click", onAbort);
  })();
})();

