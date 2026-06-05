(function () {
  const vscode = acquireVsCodeApi();

  /** @type {{
   *   temperature: number,
   *   dialect: string,
   *   activePlatform: string,
   *   platformOptions: Array<{ id: string, label: string }>,
   *   platformPrompts: Record<string, string>,
   *   activeApiProfileId: string,
   *   apiProfiles: Array<{ id: string, name: string, provider: string, apiBaseUrl: string, model: string, maskedKey: string, hasApiKey: boolean, updatedAt: number }>,
   *   defaultApiForm: { provider: string, apiBaseUrl: string, model: string },
   *   providerOptions: Array<{ id: string, label: string }>,
   *   defaultByProvider: Record<string, { apiBaseUrl: string, model: string }>,
   *   modelCatalog: Record<string, Array<{ id: string, label: string }>>,
   *   presetTables: Array<{ id: string, tableName: string, fields: Array<{ name: string, comment: string }> }>,
   *   presetEvents: Array<{ id: string, tableName: string, eventName: string, attributes: Array<{ name: string, comment: string }> }>
   * } | null} */
  let settings = null;
  let lastSql = "";
  let initialized = false;
  let editingApiProfileId = "";

  const els = {
    provider: /** @type {HTMLSelectElement} */ (document.getElementById("provider")),
    apiBaseUrl: /** @type {HTMLInputElement} */ (document.getElementById("apiBaseUrl")),
    model: /** @type {HTMLSelectElement} */ (document.getElementById("model")),
    apiKey: /** @type {HTMLInputElement} */ (document.getElementById("apiKey")),
    apiProfileName: /** @type {HTMLInputElement} */ (document.getElementById("apiProfileName")),
    saveApi: document.getElementById("saveApi"),
    checkApi: document.getElementById("checkApi"),
    apiCheckStatus: document.getElementById("apiCheckStatus"),
    savedApis: document.getElementById("savedApis"),
    dialect: /** @type {HTMLSelectElement} */ (document.getElementById("dialect")),
    temperature: /** @type {HTMLInputElement} */ (document.getElementById("temperature")),
    targetPlatform: /** @type {HTMLSelectElement} */ (document.getElementById("targetPlatform")),
    platformSystemPrompt: /** @type {HTMLTextAreaElement} */ (document.getElementById("platformSystemPrompt")),
    savePlatformPrompt: document.getElementById("savePlatformPrompt"),
    presetTables: document.getElementById("presetTables"),
    presetEvents: document.getElementById("presetEvents"),
    addPresetTable: document.getElementById("addPresetTable"),
    addPresetEvent: document.getElementById("addPresetEvent"),
    savePresetTables: document.getElementById("savePresetTables"),
    tables: document.getElementById("tables"),
    addTable: document.getElementById("addTable"),
    globalModeGoal: /** @type {HTMLInputElement} */ (document.getElementById("globalModeGoal")),
    globalModeStructured: /** @type {HTMLInputElement} */ (document.getElementById("globalModeStructured")),
    globalGoalBlock: document.getElementById("globalGoalBlock"),
    globalStructuredBlock: document.getElementById("globalStructuredBlock"),
    globalUserGoal: /** @type {HTMLTextAreaElement} */ (document.getElementById("globalUserGoal")),
    globalGroupByFields: /** @type {HTMLInputElement} */ (document.getElementById("globalGroupByFields")),
    globalOrderBy: /** @type {HTMLInputElement} */ (document.getElementById("globalOrderBy")),
    globalAggregateFields: /** @type {HTMLTextAreaElement} */ (document.getElementById("globalAggregateFields")),
    generate: document.getElementById("generate"),
    abort: document.getElementById("abort"),
    insertEditor: document.getElementById("insertEditor"),
    output: document.getElementById("output"),
  };

  function showToast(msg) {
    let t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function formatTime(ts) {
    if (!ts) return "(未知)";
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "(未知)" : d.toLocaleString();
  }

  function escAttr(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function parseCsv(text) {
    return text
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function parseAggregateFields(text) {
    return text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function parseFieldsFromNaturalLanguage(text) {
    const chunks = text
      .split(/\r?\n|[；;]+/)
      .flatMap((line) => line.split(/[，,]+/))
      .map((s) => s.trim())
      .filter(Boolean);
    const out = [];
    for (const item of chunks) {
      let m = item.match(/^([a-zA-Z0-9_#$.\-]+)\s*[:：|]\s*(.+)$/);
      if (m) {
        out.push({ name: m[1].trim(), comment: m[2].trim() });
        continue;
      }
      m = item.match(/^([a-zA-Z0-9_#$.\-]+)\s*[（(]\s*(.+?)\s*[)）]$/);
      if (m) {
        out.push({ name: m[1].trim(), comment: m[2].trim() });
        continue;
      }
      m = item.match(/^([a-zA-Z0-9_#$.\-]+)\s+(.+)$/);
      if (m) {
        out.push({ name: m[1].trim(), comment: m[2].trim() });
        continue;
      }
      if (/^[a-zA-Z0-9_#$.\-]+$/.test(item)) {
        out.push({ name: item, comment: "" });
      }
    }
    return out.filter((x) => x.name);
  }

  function appendFieldRow(container, data) {
    const row = document.createElement("div");
    row.className = "field-row";
    row.innerHTML = `
      <input type="text" class="field-name" placeholder="字段名（如 user_id）" value="${escAttr(data?.name)}" />
      <input type="text" class="field-comment" placeholder="字段注释（可选）" value="${escAttr(data?.comment)}" />
      <button type="button" class="small secondary remove-field">删除</button>
    `;
    row.querySelector(".remove-field").addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

  function buildFieldRows(container, fields) {
    container.innerHTML = "";
    const source = Array.isArray(fields) ? fields : [];
    if (!source.length) {
      appendFieldRow(container, {});
      return;
    }
    for (const f of source) appendFieldRow(container, f);
  }

  function readFieldsFromRows(container) {
    return Array.from(container.querySelectorAll(".field-row"))
      .map((row) => {
        const name = /** @type {HTMLInputElement} */ (row.querySelector(".field-name")).value.trim();
        const comment = /** @type {HTMLInputElement} */ (row.querySelector(".field-comment")).value.trim();
        if (!name) return null;
        return { name, comment };
      })
      .filter((x) => Boolean(x));
  }

  function refreshModelSelect(preferredModel) {
    const providerId = els.provider.value;
    const list = settings?.modelCatalog?.[providerId] ?? [];
    els.model.innerHTML = "";
    for (const m of list) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      els.model.appendChild(opt);
    }
    if (preferredModel && !list.some((x) => x.id === preferredModel)) {
      const opt = document.createElement("option");
      opt.value = preferredModel;
      opt.textContent = preferredModel + "（已保存）";
      els.model.appendChild(opt);
    }
    const fallback = list[0]?.id ?? "";
    els.model.value = preferredModel || fallback;
  }

  function fillProviderDefaults() {
    if (!settings?.defaultByProvider) return;
    const d = settings.defaultByProvider[els.provider.value];
    if (d) {
      els.apiBaseUrl.value = d.apiBaseUrl;
      refreshModelSelect(d.model);
    }
  }

  function renderSavedApiProfiles() {
    const list = settings?.apiProfiles ?? [];
    els.savedApis.innerHTML = "";
    if (!list.length) {
      els.savedApis.innerHTML = '<p class="hint">尚无已保存 API。</p>';
      return;
    }
    for (const api of list) {
      const item = document.createElement("div");
      item.className = "saved-api";
      item.innerHTML = `
        <div class="saved-api-head">
          <label><input type="radio" name="active-api" ${api.id === settings.activeApiProfileId ? "checked" : ""}/> 启用</label>
          <strong class="saved-api-name">${escAttr(api.name)}</strong>
        </div>
        <div class="saved-api-grid">
          <div><span>厂商</span><strong>${escAttr(api.provider)}</strong></div>
          <div><span>模型</span><strong>${escAttr(api.model)}</strong></div>
          <div><span>Key</span><strong>${escAttr(api.maskedKey)}</strong></div>
          <div><span>更新时间</span><strong>${escAttr(formatTime(api.updatedAt))}</strong></div>
        </div>
        <div class="row saved-api-actions">
          <button type="button" class="small secondary edit-api">编辑</button>
          <button type="button" class="small secondary delete-api">删除</button>
        </div>
      `;
      item.querySelector('input[name="active-api"]').addEventListener("change", () => {
        vscode.postMessage({ type: "setActiveApiProfile", payload: api.id });
      });
      item.querySelector(".edit-api").addEventListener("click", () => {
        editingApiProfileId = api.id;
        els.apiProfileName.value = api.name;
        els.provider.value = api.provider;
        refreshModelSelect(api.model);
        els.apiBaseUrl.value = api.apiBaseUrl;
        els.model.value = api.model;
        els.apiKey.value = "";
        showToast("已载入 API 配置，可修改后保存。");
      });
      item.querySelector(".delete-api").addEventListener("click", () => {
        vscode.postMessage({ type: "deleteApiProfile", payload: api.id });
      });
      els.savedApis.appendChild(item);
    }
  }

  function refreshPresetBlockIndexes() {
    Array.from(els.presetTables.querySelectorAll(".preset-block")).forEach((block, idx) => {
      const title = block.querySelector(".preset-title");
      const name = /** @type {HTMLInputElement} */ (block.querySelector(".preset-table-name"))?.value?.trim() ?? "";
      title.textContent = name || `预设表 #${idx + 1}`;
    });
  }

  function refreshPresetEventBlockIndexes() {
    Array.from(els.presetEvents.querySelectorAll(".preset-event-block")).forEach((block, idx) => {
      const title = block.querySelector(".preset-event-title");
      const name = /** @type {HTMLInputElement} */ (block.querySelector(".preset-event-name"))?.value?.trim() ?? "";
      title.textContent = name || `预设事件 #${idx + 1}`;
    });
  }

  function refreshTableBlockIndexes() {
    Array.from(els.tables.querySelectorAll(".table-block")).forEach((block, idx) => {
      const title = block.querySelector(".table-title");
      title.textContent = `表块 #${idx + 1}`;
    });
  }

  function refreshEventIndexes(eventsWrap) {
    Array.from(eventsWrap.querySelectorAll(".event-item")).forEach((ev, idx) => {
      const title = ev.querySelector(".event-title");
      title.textContent = `事件 #${idx + 1}`;
    });
  }

  function collectPresetEventsDraft() {
    return Array.from(els.presetEvents.querySelectorAll(".preset-event-block"))
      .map((block) => {
        const id = block.dataset.id || `preset_event_${Date.now()}_${Math.random()}`;
        const tableName = /** @type {HTMLInputElement} */ (block.querySelector(".preset-event-table-name")).value.trim();
        const eventName = /** @type {HTMLInputElement} */ (block.querySelector(".preset-event-name")).value.trim();
        const attributes = readFieldsFromRows(block.querySelector(".preset-event-attr-rows"));
        if (!eventName) return null;
        return { id, tableName, eventName, attributes };
      })
      .filter((x) => Boolean(x));
  }

  function getPresetEventTemplates(eventTableName) {
    const tableName = (eventTableName || "").trim();
    const all = collectPresetEventsDraft();
    if (!tableName) return all;
    return all.filter((x) => !x.tableName || x.tableName === tableName);
  }

  function listPresetEventTables() {
    const set = new Set();
    for (const ev of collectPresetEventsDraft()) {
      const tableName = (ev.tableName || "").trim();
      if (tableName) set.add(tableName);
    }
    return Array.from(set);
  }

  function addEventItem(eventsWrap, data, getEventTableName) {
    const ev = document.createElement("div");
    ev.className = "event-item";
    ev.innerHTML = `
      <header>
        <span class="event-title">事件</span>
        <button type="button" class="small secondary remove-event">移除事件</button>
      </header>
      <label>预设事件名（可选）</label>
      <select class="event-name-select"></select>
      <label>或手动事件名（用于 WHERE "$part_event" = 'xxx'）</label>
      <input type="text" class="event-name" placeholder="例如 auto_pay_v2_success" value="${escAttr(data?.eventName)}" />
      <label>事件属性（单元输入）</label>
      <div class="field-rows event-attr-rows"></div>
      <button type="button" class="small secondary add-event-attr">+ 添加属性</button>
    `;
    const attrs = ev.querySelector(".event-attr-rows");
    const eventSelect = /** @type {HTMLSelectElement} */ (ev.querySelector(".event-name-select"));
    const refreshEventOptions = () => {
      const options = getPresetEventTemplates(getEventTableName?.() ?? "");
      const selected = eventSelect.value;
      eventSelect.innerHTML = "";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "不使用预设事件";
      eventSelect.appendChild(empty);
      for (const x of options) {
        const opt = document.createElement("option");
        opt.value = `${x.tableName}::${x.eventName}`;
        opt.textContent = `${x.eventName}（${x.tableName}）`;
        eventSelect.appendChild(opt);
      }
      if (selected && Array.from(eventSelect.options).some((o) => o.value === selected)) {
        eventSelect.value = selected;
      }
    };
    refreshEventOptions();
    buildFieldRows(attrs, data?.attributes ?? []);
    eventSelect.addEventListener("change", () => {
      const raw = eventSelect.value;
      if (!raw) return;
      const [tbl, eventName] = raw.split("::");
      const target = getPresetEventTemplates(tbl).find((x) => x.eventName === eventName);
      if (!target) return;
      /** @type {HTMLInputElement} */ (ev.querySelector(".event-name")).value = target.eventName;
      buildFieldRows(attrs, target.attributes ?? []);
    });
    ev.querySelector(".add-event-attr").addEventListener("click", () => appendFieldRow(attrs, {}));
    ev.querySelector(".remove-event").addEventListener("click", () => {
      ev.remove();
      refreshEventIndexes(eventsWrap);
    });
    eventsWrap.appendChild(ev);
    eventsWrap.dispatchEvent(new CustomEvent("eventsChanged"));
    refreshEventIndexes(eventsWrap);
  }

  function collectPresetTablesDraft() {
    return Array.from(els.presetTables.querySelectorAll(".preset-block"))
      .map((block) => {
        const id = block.dataset.id || `preset_${Date.now()}_${Math.random()}`;
        const tableName = /** @type {HTMLInputElement} */ (block.querySelector(".preset-table-name")).value.trim();
        const fields = readFieldsFromRows(block.querySelector(".preset-field-rows"));
        if (!tableName) return null;
        return { id, tableName, fields };
      })
      .filter((x) => Boolean(x));
  }

  function renderPresetSelect(select, selectedId) {
    const presets = collectPresetTablesDraft();
    select.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "请选择预设表";
    select.appendChild(empty);
    for (const p of presets) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.tableName;
      select.appendChild(opt);
    }
    if (selectedId && presets.some((x) => x.id === selectedId)) {
      select.value = selectedId;
    }
  }

  function refreshAllTablePresetOptions() {
    const presets = collectPresetTablesDraft();
    const eventTables = listPresetEventTables();
    for (const block of Array.from(els.tables.querySelectorAll(".table-block"))) {
      const select = /** @type {HTMLSelectElement} */ (block.querySelector(".preset-table-select"));
      const selected = select.value;
      renderPresetSelect(select, selected);
      const match = presets.find((x) => x.id === select.value);
      const hint = block.querySelector(".preset-fields-preview");
      hint.textContent = match ? match.fields.map((f) => `${f.name}${f.comment ? `: ${f.comment}` : ""}`).join(" | ") : "";
      const eventTableSelect = /** @type {HTMLSelectElement} */ (block.querySelector(".event-table-name-select"));
      if (eventTableSelect) {
        const selectedEventTable = eventTableSelect.value;
        eventTableSelect.innerHTML = "";
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = eventTables.length ? "请选择预设事件表" : "暂无预设事件表";
        eventTableSelect.appendChild(empty);
        for (const t of eventTables) {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          eventTableSelect.appendChild(opt);
        }
        if (selectedEventTable && eventTables.includes(selectedEventTable)) {
          eventTableSelect.value = selectedEventTable;
        }
      }
      const eventTableName = eventTableSelect?.value ?? "";
      const options = getPresetEventTemplates(eventTableName);
      for (const evSelect of Array.from(block.querySelectorAll(".event-name-select"))) {
        const selected = evSelect.value;
        evSelect.innerHTML = "";
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "不使用预设事件";
        evSelect.appendChild(empty);
        for (const x of options) {
          const opt = document.createElement("option");
          opt.value = `${x.tableName}::${x.eventName}`;
          opt.textContent = `${x.eventName}（${x.tableName}）`;
          evSelect.appendChild(opt);
        }
        if (selected && Array.from(evSelect.options).some((o) => o.value === selected)) {
          evSelect.value = selected;
        }
      }
    }
  }

  function addPresetTableBlock(data) {
    const id = data?.id || `preset_${Date.now()}_${Math.random()}`;
    const wrap = document.createElement("div");
    wrap.className = "preset-block";
    wrap.dataset.id = id;
    wrap.innerHTML = `
      <details>
        <summary class="preset-title">预设表（未命名）</summary>
        <label>表名</label>
        <input type="text" class="preset-table-name" placeholder="例如 users" value="${escAttr(data?.tableName)}" />
        <label>字段（单元输入）</label>
        <div class="field-rows preset-field-rows"></div>
        <button type="button" class="small secondary add-preset-field">+ 添加字段</button>
        <label>自然语言字段输入（识别字段及注释）</label>
        <textarea class="preset-field-nl" rows="3" placeholder="例如：user_id 用户ID, w_area 区域, lottery_type: 彩种"></textarea>
        <button type="button" class="small secondary parse-preset-nl">识别并覆盖字段</button>
        <div class="row">
          <button type="button" class="small secondary remove-preset">移除该预设表</button>
        </div>
      </details>
    `;
    const rows = wrap.querySelector(".preset-field-rows");
    const nameInput = /** @type {HTMLInputElement} */ (wrap.querySelector(".preset-table-name"));
    const title = wrap.querySelector(".preset-title");
    const refreshTitle = () => {
      const name = nameInput.value.trim();
      title.textContent = name || "预设表（未命名）";
    };
    nameInput.addEventListener("input", () => {
      refreshTitle();
      refreshAllTablePresetOptions();
    });
    refreshTitle();

    buildFieldRows(rows, data?.fields ?? []);
    wrap.querySelector(".add-preset-field").addEventListener("click", () => appendFieldRow(rows, {}));
    wrap.querySelector(".parse-preset-nl").addEventListener("click", () => {
      const raw = /** @type {HTMLTextAreaElement} */ (wrap.querySelector(".preset-field-nl")).value;
      const parsed = parseFieldsFromNaturalLanguage(raw);
      if (!parsed.length) {
        showToast("未识别到字段，请检查输入格式。");
        return;
      }
      buildFieldRows(rows, parsed);
      showToast(`已识别 ${parsed.length} 个字段。`);
    });
    wrap.querySelector(".remove-preset").addEventListener("click", () => {
      wrap.remove();
      refreshPresetBlockIndexes();
      refreshAllTablePresetOptions();
    });
    els.presetTables.appendChild(wrap);
    refreshPresetBlockIndexes();
  }

  function addPresetEventBlock(data) {
    const id = data?.id || `preset_event_${Date.now()}_${Math.random()}`;
    const wrap = document.createElement("div");
    wrap.className = "preset-event-block";
    wrap.dataset.id = id;
    wrap.innerHTML = `
      <details>
        <summary class="preset-event-title">预设事件（未命名）</summary>
        <label>事件所属表（可选，用于事件表联动）</label>
        <input type="text" class="preset-event-table-name" placeholder="例如 v_event_9" value="${escAttr(data?.tableName)}" />
        <label>事件名</label>
        <input type="text" class="preset-event-name" placeholder="例如 auto_pay_v2_success" value="${escAttr(data?.eventName)}" />
        <label>事件属性（单元输入）</label>
        <div class="field-rows preset-event-attr-rows"></div>
        <button type="button" class="small secondary add-preset-event-attr">+ 添加属性</button>
        <label>自然语言属性输入（识别字段及注释）</label>
        <textarea class="preset-event-nl" rows="3" placeholder="例如：#user_id 用户ID, w_area 区域, lottery_type: 彩种"></textarea>
        <button type="button" class="small secondary parse-preset-event-nl">识别并覆盖属性</button>
        <div class="row">
          <button type="button" class="small secondary remove-preset-event">移除该预设事件</button>
        </div>
      </details>
    `;
    const attrRows = wrap.querySelector(".preset-event-attr-rows");
    buildFieldRows(attrRows, data?.attributes ?? []);
    wrap.querySelector(".add-preset-event-attr").addEventListener("click", () => appendFieldRow(attrRows, {}));
    wrap.querySelector(".parse-preset-event-nl").addEventListener("click", () => {
      const raw = /** @type {HTMLTextAreaElement} */ (wrap.querySelector(".preset-event-nl")).value;
      const parsed = parseFieldsFromNaturalLanguage(raw);
      if (!parsed.length) {
        showToast("未识别到事件属性，请检查输入格式。");
        return;
      }
      buildFieldRows(attrRows, parsed);
      refreshAllTablePresetOptions();
      showToast(`已识别 ${parsed.length} 个事件属性。`);
    });
    const onChange = () => {
      refreshPresetEventBlockIndexes();
      refreshAllTablePresetOptions();
    };
    wrap.querySelector(".preset-event-name").addEventListener("input", onChange);
    wrap.querySelector(".preset-event-table-name").addEventListener("input", onChange);
    wrap.querySelector(".remove-preset-event").addEventListener("click", () => {
      wrap.remove();
      refreshPresetEventBlockIndexes();
      refreshAllTablePresetOptions();
    });
    els.presetEvents.appendChild(wrap);
    refreshPresetEventBlockIndexes();
  }

  function addTableBlock(data) {
    const wrap = document.createElement("div");
    wrap.className = "table-block";
    wrap.innerHTML = `
      <header>
        <span class="table-title">表块</span>
        <button type="button" class="small secondary remove-table">移除</button>
      </header>
      <label>表来源</label>
      <select class="table-source-mode">
        <option value="manual">新表（填写）</option>
        <option value="preset">旧表（预设下拉）</option>
        <option value="event">事件表</option>
      </select>
      <div class="manual-table-block">
        <label>新表名</label>
        <input type="text" class="base-table" placeholder="例如 orders" value="${escAttr(data?.baseTable)}" />
        <label>新表字段（单元输入）</label>
        <div class="field-rows manual-field-rows"></div>
        <button type="button" class="small secondary add-manual-field">+ 添加字段</button>
      </div>
      <div class="preset-table-block" style="display:none">
        <label>旧表（从预设中选择）</label>
        <select class="preset-table-select"></select>
        <p class="hint preset-fields-preview"></p>
      </div>
      <div class="event-table-block" style="display:none">
        <label>事件表名（从预设事件表中选择）</label>
        <select class="event-table-name-select"></select>
        <p class="hint">示例：SELECT "#user_id","w_area" FROM v_event_9 WHERE "$part_event"='auto_pay_v2_success'</p>
        <div class="event-items"></div>
        <button type="button" class="small secondary add-event-item">+ 添加事件</button>
      </div>
    `;
    const modeSelect = /** @type {HTMLSelectElement} */ (wrap.querySelector(".table-source-mode"));
    const manualBlock = wrap.querySelector(".manual-table-block");
    const presetBlock = wrap.querySelector(".preset-table-block");
    const eventBlock = wrap.querySelector(".event-table-block");
    const presetSelect = /** @type {HTMLSelectElement} */ (wrap.querySelector(".preset-table-select"));
    const presetPreview = wrap.querySelector(".preset-fields-preview");
    const manualRows = wrap.querySelector(".manual-field-rows");
    const eventsWrap = wrap.querySelector(".event-items");

    buildFieldRows(manualRows, data?.fields ?? []);
    const eventTableNameSelect = /** @type {HTMLSelectElement} */ (wrap.querySelector(".event-table-name-select"));
    wrap.querySelector(".add-manual-field").addEventListener("click", () => appendFieldRow(manualRows, {}));
    wrap
      .querySelector(".add-event-item")
      .addEventListener("click", () => addEventItem(eventsWrap, {}, () => eventTableNameSelect.value.trim()));
    renderPresetSelect(presetSelect, data?.presetId);
    for (const ev of data?.events ?? []) addEventItem(eventsWrap, ev, () => eventTableNameSelect.value.trim());
    refreshAllTablePresetOptions();
    if (data?.eventTableName) {
      eventTableNameSelect.value = data.eventTableName;
    }
    eventTableNameSelect.addEventListener("change", () => refreshAllTablePresetOptions());

    const switchSource = () => {
      const mode = modeSelect.value;
      manualBlock.style.display = mode === "manual" ? "block" : "none";
      presetBlock.style.display = mode === "preset" ? "block" : "none";
      eventBlock.style.display = mode === "event" ? "block" : "none";
      const match = collectPresetTablesDraft().find((x) => x.id === presetSelect.value);
      presetPreview.textContent = match ? match.fields.map((f) => `${f.name}${f.comment ? `: ${f.comment}` : ""}`).join(" | ") : "";
    };
    modeSelect.addEventListener("change", switchSource);
    presetSelect.addEventListener("change", switchSource);
    wrap.querySelector(".remove-table").addEventListener("click", () => {
      wrap.remove();
      refreshTableBlockIndexes();
    });

    if (data?.sourceKind === "preset" || data?.tableSourceMode === "preset") modeSelect.value = "preset";
    if (data?.sourceKind === "event") modeSelect.value = "event";
    switchSource();
    els.tables.appendChild(wrap);
    refreshTableBlockIndexes();
  }

  function ensureOneTable() {
    if (!els.tables.querySelector(".table-block")) addTableBlock({});
  }

  function mergeFieldsFromEvents(events) {
    const m = new Map();
    for (const ev of events) {
      for (const f of ev.attributes ?? []) {
        if (!m.has(f.name)) m.set(f.name, f.comment || "");
      }
    }
    return Array.from(m.entries()).map(([name, comment]) => ({ name, comment }));
  }

  function switchGlobalResultMode() {
    const useGoal = els.globalModeGoal.checked;
    els.globalGoalBlock.style.display = useGoal ? "block" : "none";
    els.globalStructuredBlock.style.display = useGoal ? "none" : "block";
  }

  function collectPayload() {
    ensureOneTable();
    const presets = collectPresetTablesDraft();
    const activePlatform = els.targetPlatform.value || "xunshu";
    const resultMode = els.globalModeGoal.checked ? "goal" : "structured";
    const globalGoal = els.globalUserGoal.value;
    const globalGroupByFieldsText = els.globalGroupByFields.value;
    const globalOrderBy = els.globalOrderBy.value;
    const globalAggregateFieldsText = els.globalAggregateFields.value;
    const tables = Array.from(els.tables.querySelectorAll(".table-block")).map((block) => {
      const sourceKind = /** @type {HTMLSelectElement} */ (block.querySelector(".table-source-mode")).value;

      if (sourceKind === "event") {
        const eventTableName = /** @type {HTMLSelectElement} */ (block.querySelector(".event-table-name-select")).value.trim();
        const events = Array.from(block.querySelectorAll(".event-item"))
          .map((ev) => {
            const eventName = /** @type {HTMLInputElement} */ (ev.querySelector(".event-name")).value.trim();
            const attributes = readFieldsFromRows(ev.querySelector(".event-attr-rows"));
            if (!eventName) return null;
            return { eventName, attributes };
          })
          .filter((x) => Boolean(x));
        return {
          sourceKind: "event",
          baseTable: eventTableName,
          eventTableName,
          events,
          fields: mergeFieldsFromEvents(events),
          resultMode,
          userGoal: resultMode === "goal" ? globalGoal : "",
          resultSpec:
            resultMode === "structured"
              ? {
                  groupByFields: parseCsv(globalGroupByFieldsText),
                  orderBy: globalOrderBy.trim(),
                  aggregateFields: parseAggregateFields(globalAggregateFieldsText),
                }
              : undefined,
        };
      }

      if (sourceKind === "preset") {
        const presetId = /** @type {HTMLSelectElement} */ (block.querySelector(".preset-table-select")).value;
        const preset = presets.find((x) => x.id === presetId);
        return {
          sourceKind: "preset",
          baseTable: preset?.tableName || "",
          fields: preset?.fields || [],
          resultMode,
          userGoal: resultMode === "goal" ? globalGoal : "",
          resultSpec:
            resultMode === "structured"
              ? {
                  groupByFields: parseCsv(globalGroupByFieldsText),
                  orderBy: globalOrderBy.trim(),
                  aggregateFields: parseAggregateFields(globalAggregateFieldsText),
                }
              : undefined,
        };
      }

      const baseTable = /** @type {HTMLInputElement} */ (block.querySelector(".base-table")).value.trim();
      const fields = readFieldsFromRows(block.querySelector(".manual-field-rows"));
      return {
        sourceKind: "manual",
        baseTable,
        fields,
        resultMode,
        userGoal: resultMode === "goal" ? globalGoal : "",
        resultSpec:
          resultMode === "structured"
            ? {
                groupByFields: parseCsv(globalGroupByFieldsText),
                orderBy: globalOrderBy.trim(),
                aggregateFields: parseAggregateFields(globalAggregateFieldsText),
              }
            : undefined,
      };
    });

    return {
      dialect: els.dialect.value,
      targetPlatform: activePlatform,
      apiProfileId: settings?.activeApiProfileId || "",
      tables,
      temperature: Number(els.temperature.value),
    };
  }

  function savePresetTables() {
    const presetTables = collectPresetTablesDraft();
    const presetEvents = collectPresetEventsDraft();
    vscode.postMessage({ type: "savePresetTables", payload: { presetTables, presetEvents } });
    refreshAllTablePresetOptions();
  }

  function saveApiProfile() {
    vscode.postMessage({
      type: "saveApiProfile",
      payload: {
        id: editingApiProfileId,
        name: els.apiProfileName.value.trim(),
        provider: els.provider.value,
        apiBaseUrl: els.apiBaseUrl.value.trim(),
        model: els.model.value.trim(),
        apiKey: els.apiKey.value.trim(),
      },
    });
    els.apiKey.value = "";
  }

  function checkApiProfile() {
    const apiKeyInput = els.apiKey.value.trim();
    const useSaved =
      settings?.apiProfiles?.find((x) => x.id === editingApiProfileId || x.id === settings.activeApiProfileId) ?? null;
    const fallbackKey = apiKeyInput || "";
    vscode.postMessage({
      type: "checkApiProfile",
      payload: {
        id: editingApiProfileId,
        name: els.apiProfileName.value.trim(),
        provider: els.provider.value,
        apiBaseUrl: els.apiBaseUrl.value.trim(),
        model: els.model.value.trim(),
        apiKey: fallbackKey || (useSaved?.hasApiKey ? "__use_saved__" : ""),
      },
    });
    els.apiCheckStatus.textContent = "正在检查...";
  }

  function onPlatformChange() {
    if (!settings) return;
    const id = els.targetPlatform.value || "xunshu";
    els.platformSystemPrompt.value = settings.platformPrompts?.[id] ?? "";
    vscode.postMessage({ type: "setActivePlatform", payload: id });
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "settings") {
      settings = msg.settings;
      els.provider.innerHTML = "";
      for (const p of settings.providerOptions ?? []) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        els.provider.appendChild(opt);
      }
      if (!initialized) {
        const d = settings.defaultApiForm ?? {};
        els.provider.value = d.provider || "deepseek";
        els.apiBaseUrl.value = d.apiBaseUrl || "";
        refreshModelSelect(d.model || "");
      } else {
        refreshModelSelect(els.model.value);
      }

      els.targetPlatform.innerHTML = "";
      for (const p of settings.platformOptions ?? []) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        els.targetPlatform.appendChild(opt);
      }
      els.targetPlatform.value = settings.activePlatform || "xunshu";
      els.platformSystemPrompt.value = settings.platformPrompts?.[els.targetPlatform.value] ?? "";
      els.temperature.value = String(settings.temperature ?? 0.2);
      if (settings.dialect) els.dialect.value = settings.dialect;

      renderSavedApiProfiles();

      els.presetTables.innerHTML = "";
      els.presetEvents.innerHTML = "";
      const presets = Array.isArray(settings.presetTables) ? settings.presetTables : [];
      const presetEvents = Array.isArray(settings.presetEvents) ? settings.presetEvents : [];
      if (presets.length) {
        for (const p of presets) addPresetTableBlock(p);
      } else {
        addPresetTableBlock({});
      }
      if (presetEvents.length) {
        for (const e of presetEvents) addPresetEventBlock(e);
      } else {
        addPresetEventBlock({});
      }
      refreshAllTablePresetOptions();

      if (!initialized) {
        ensureOneTable();
        initialized = true;
      }
    }
    if (msg.type === "toast") showToast(msg.message);
    if (msg.type === "generating") {
      els.generate.disabled = msg.value;
      els.abort.disabled = !msg.value;
    }
    if (msg.type === "result") {
      if (msg.clear) els.output.textContent = "";
      if (msg.error) {
        els.output.textContent = "错误: " + msg.error;
        lastSql = "";
      } else if (typeof msg.sql === "string") {
        els.output.textContent = msg.sql;
        lastSql = msg.sql;
      }
    }
    if (msg.type === "apiCheckResult") {
      els.apiCheckStatus.textContent = msg.message || "";
      if (msg.ok) {
        showToast("API 检查通过。");
      }
    }
  });

  els.provider.addEventListener("change", () => fillProviderDefaults());
  els.targetPlatform.addEventListener("change", onPlatformChange);
  els.globalModeGoal.addEventListener("change", switchGlobalResultMode);
  els.globalModeStructured.addEventListener("change", switchGlobalResultMode);
  els.savePlatformPrompt.addEventListener("click", () => {
    vscode.postMessage({
      type: "savePlatformPrompt",
      payload: {
        platformId: els.targetPlatform.value || "xunshu",
        systemPrompt: els.platformSystemPrompt.value,
      },
    });
  });
  els.addPresetTable.addEventListener("click", () => addPresetTableBlock({}));
  els.addPresetEvent.addEventListener("click", () => addPresetEventBlock({}));
  els.savePresetTables.addEventListener("click", savePresetTables);
  els.addTable.addEventListener("click", () => addTableBlock({}));
  els.saveApi.addEventListener("click", saveApiProfile);
  els.checkApi.addEventListener("click", checkApiProfile);
  els.generate.addEventListener("click", () => {
    vscode.postMessage({ type: "generate", payload: collectPayload() });
  });
  els.abort.addEventListener("click", () => vscode.postMessage({ type: "abort" }));
  els.insertEditor.addEventListener("click", () => vscode.postMessage({ type: "insertEditor", payload: lastSql }));

  switchGlobalResultMode();
  vscode.postMessage({ type: "ready" });
})();
