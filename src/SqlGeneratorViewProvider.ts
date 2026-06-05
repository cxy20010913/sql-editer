import * as vscode from "vscode";
import { chatCompletions } from "./llm/client";
import { buildSystemPrompt, buildUserPrompt } from "./prompts/buildPrompt";
import type { GeneratePayload, SqlDialect } from "./types";

const SECRET_KEY = "sqlGenerator.openaiCompatibleApiKey";
const SECRET_API_KEY_MAP = "sqlGenerator.apiKeyMap";
const STATE_PROVIDER = "sqlGenerator.provider";
const STATE_BASE_URL = "sqlGenerator.apiBaseUrl";
const STATE_MODEL = "sqlGenerator.model";
const STATE_API_UPDATED_AT = "sqlGenerator.apiUpdatedAt";
const STATE_PRESET_TABLES = "sqlGenerator.presetTables";
const STATE_PRESET_EVENTS = "sqlGenerator.presetEvents";
const STATE_API_PROFILES = "sqlGenerator.apiProfiles";
const STATE_ACTIVE_API_PROFILE = "sqlGenerator.activeApiProfile";
const STATE_PLATFORM_PROMPTS = "sqlGenerator.platformPrompts";
const STATE_ACTIVE_PLATFORM = "sqlGenerator.activePlatform";

export type LlmProviderId = "zhipu" | "qwen" | "deepseek" | "kimi" | "minimax" | "doubao";

export const PROVIDER_OPTIONS: { id: LlmProviderId; label: string }[] = [
  { id: "zhipu", label: "智谱 GLM" },
  { id: "qwen", label: "阿里通义千问 Qwen" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "kimi", label: "Kimi（月之暗面 Moonshot）" },
  { id: "minimax", label: "MiniMax" },
  { id: "doubao", label: "字节豆包（火山方舟）" },
];

/**
 * 各厂商主流模型（value 为 OpenAI 兼容接口的 model 字段）。
 * ID 随厂商迭代会变，请以控制台 / 官方文档为准；未列出时可依赖「已保存」或向仓库提 issue。
 */
export const MODEL_CATALOG: Record<LlmProviderId, { id: string; label: string }[]> = {
  zhipu: [
    { id: "glm-5.1", label: "GLM-5.1（最新）" },
    { id: "glm-4.7-flash", label: "GLM-4.7-Flash（旗舰轻量 · 长上下文）" },
    { id: "glm-4.7", label: "GLM-4.7（旗舰）" },
    { id: "glm-4.6", label: "GLM-4.6" },
    { id: "glm-4.5-air", label: "GLM-4.5-Air" },
    { id: "glm-4.5", label: "GLM-4.5" },
    { id: "glm-4-flash", label: "GLM-4-Flash" },
    { id: "glm-4-air", label: "GLM-4-Air" },
    { id: "glm-4-airx", label: "GLM-4-AirX" },
    { id: "glm-4-plus", label: "GLM-4-Plus" },
    { id: "glm-4", label: "GLM-4" },
    { id: "glm-4-long", label: "GLM-4-Long" },
    { id: "glm-z1-flash", label: "GLM-Z1-Flash（推理）" },
    { id: "glm-3-turbo", label: "GLM-3-Turbo" },
  ],
  qwen: [
    { id: "qwen3-max", label: "Qwen3-Max（旗舰）" },
    { id: "qwen3-max-preview", label: "Qwen3-Max-Preview" },
    { id: "qwen3.6-plus", label: "Qwen3.6-Plus" },
    { id: "qwen3.5-plus", label: "Qwen3.5-Plus" },
    { id: "qwen3.5-flash", label: "Qwen3.5-Flash" },
    { id: "qwen-plus", label: "Qwen-Plus" },
    { id: "qwen-flash", label: "Qwen-Flash" },
    { id: "qwen-turbo", label: "Qwen-Turbo" },
    { id: "qwen-max", label: "Qwen-Max" },
    { id: "qwen-long", label: "Qwen-Long" },
    { id: "qwen2.5-72b-instruct", label: "Qwen2.5-72B-Instruct" },
    { id: "qwen2.5-32b-instruct", label: "Qwen2.5-32B-Instruct" },
    { id: "qwen2.5-14b-instruct", label: "Qwen2.5-14B-Instruct" },
    { id: "qwen2.5-7b-instruct", label: "Qwen2.5-7B-Instruct" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "deepseek-chat（V3.2 对话 / 非思考）" },
    { id: "deepseek-reasoner", label: "deepseek-reasoner（V3.2 思考）" },
    { id: "deepseek-coder", label: "deepseek-coder（代码）" },
  ],
  kimi: [
    { id: "kimi-k2.5", label: "Kimi K2.5（主力）" },
    { id: "kimi-k2-thinking", label: "Kimi K2 Thinking（深度推理）" },
    { id: "kimi-k2", label: "Kimi K2" },
    { id: "moonshot-v1-128k", label: "Moonshot 128K" },
    { id: "moonshot-v1-32k", label: "Moonshot 32K" },
    { id: "moonshot-v1-8k", label: "Moonshot 8K" },
    { id: "moonshot-v1-auto", label: "Moonshot Auto" },
  ],
  minimax: [
    { id: "minimax-m2.7", label: "MiniMax-M2.7（旗舰）" },
    { id: "minimax-m2.7-highspeed", label: "MiniMax-M2.7-Highspeed" },
    { id: "minimax-m2.5", label: "MiniMax-M2.5" },
    { id: "abab6.5s-chat", label: "abab6.5s-chat" },
    { id: "abab6.5t-chat", label: "abab6.5t-chat" },
    { id: "abab6.5g-chat", label: "abab6.5g-chat" },
    { id: "abab6.5-chat", label: "abab6.5-chat" },
    { id: "abab6-chat", label: "abab6-chat" },
    { id: "MiniMax-Text-01", label: "MiniMax-Text-01" },
  ],
  doubao: [
    { id: "doubao-pro-32k", label: "豆包 Pro 32K" },
    { id: "doubao-pro-256k", label: "豆包 Pro 256K" },
    { id: "doubao-lite-32k", label: "豆包 Lite 32K" },
    { id: "doubao-lite-4k", label: "豆包 Lite 4K" },
    { id: "doubao-seed-1-6-250615", label: "Doubao-Seed-1.6（示例，以方舟控制台为准）" },
    { id: "deepseek-v3-250324", label: "DeepSeek-V3（方舟接入示例）" },
  ],
};

const PLATFORM_OPTIONS: { id: string; label: string }[] = [
  { id: "xunshu", label: "讯数" },
  { id: "shushu", label: "数数" },
];

function baseUrlForProvider(id: LlmProviderId): string {
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

export function defaultProviderDefaults(id: LlmProviderId): { apiBaseUrl: string; model: string } {
  const model =
    id === "zhipu"
      ? "glm-5.1"
      : MODEL_CATALOG[id]?.[0]?.id ?? "";
  return { apiBaseUrl: baseUrlForProvider(id), model };
}

function parseProviderId(s: string): LlmProviderId {
  const ok = PROVIDER_OPTIONS.some((o) => o.id === s);
  return ok ? (s as LlmProviderId) : "deepseek";
}

function maskApiKey(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) {
    return "(未保存)";
  }
  if (v.length <= 8) {
    return `${v.slice(0, 2)}***`;
  }
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

let lastGeneratedSql = "";

export function getLastGeneratedSql(): string {
  return lastGeneratedSql;
}

export class SqlGeneratorViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "sqlGenerator.sidebar";

  private view: vscode.WebviewView | undefined;
  private generationTokenSource: vscode.CancellationTokenSource | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg) => void this.handleMessage(webviewView.webview, msg));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.sql-generator");
  }

  private async handleMessage(webview: vscode.Webview, msg: { type: string; payload?: unknown }): Promise<void> {
    if (msg.type === "ready") {
      await this.postSettings(webview);
      return;
    }
    if (msg.type === "saveApiProfile") {
      const payload = sanitizeApiProfileInput(msg.payload);
      if (!payload.name) {
        void webview.postMessage({ type: "toast", message: "请填写 API 配置名称。" });
        return;
      }
      const state = await loadApiState(this.context);
      const now = Date.now();
      const next: ApiProfile[] = [...state.profiles];
      const idx = next.findIndex((x) => x.id === payload.id);
      const profile: ApiProfile = {
        id: payload.id || `api_${now}`,
        name: payload.name,
        provider: parseProviderId(payload.provider || "deepseek"),
        apiBaseUrl: payload.apiBaseUrl,
        model: payload.model,
        updatedAt: now,
      };
      if (idx >= 0) {
        next[idx] = profile;
      } else {
        next.push(profile);
      }
      const keyMap = { ...state.keyMap };
      if (payload.apiKey) {
        keyMap[profile.id] = payload.apiKey;
      }
      await this.context.globalState.update(STATE_API_PROFILES, next);
      await this.context.globalState.update(STATE_ACTIVE_API_PROFILE, profile.id);
      await writeApiKeyMap(this.context, keyMap);
      await this.context.globalState.update(STATE_API_UPDATED_AT, now);
      await this.postSettings(webview);
      void webview.postMessage({ type: "toast", message: "API 配置已保存。" });
      return;
    }
    if (msg.type === "deleteApiProfile") {
      const id = typeof msg.payload === "string" ? msg.payload.trim() : "";
      if (!id) {
        return;
      }
      const state = await loadApiState(this.context);
      const profiles = state.profiles.filter((x) => x.id !== id);
      const keyMap = { ...state.keyMap };
      delete keyMap[id];
      const activeId = profiles[0]?.id ?? "";
      await this.context.globalState.update(STATE_API_PROFILES, profiles);
      await this.context.globalState.update(STATE_ACTIVE_API_PROFILE, activeId);
      await writeApiKeyMap(this.context, keyMap);
      await this.postSettings(webview);
      void webview.postMessage({ type: "toast", message: "已删除 API 配置。" });
      return;
    }
    if (msg.type === "setActiveApiProfile") {
      const id = typeof msg.payload === "string" ? msg.payload.trim() : "";
      await this.context.globalState.update(STATE_ACTIVE_API_PROFILE, id);
      await this.postSettings(webview);
      return;
    }
    if (msg.type === "savePlatformPrompt") {
      const payload = sanitizePlatformPromptInput(msg.payload);
      const map = sanitizePlatformPromptMap(this.context.globalState.get<unknown>(STATE_PLATFORM_PROMPTS));
      map[payload.platformId] = payload.systemPrompt;
      await this.context.globalState.update(STATE_PLATFORM_PROMPTS, map);
      await this.context.globalState.update(STATE_ACTIVE_PLATFORM, payload.platformId);
      await this.postSettings(webview);
      void webview.postMessage({ type: "toast", message: "平台系统提示词已保存。" });
      return;
    }
    if (msg.type === "setActivePlatform") {
      const id = typeof msg.payload === "string" ? msg.payload.trim() : "";
      await this.context.globalState.update(STATE_ACTIVE_PLATFORM, id || PLATFORM_OPTIONS[0].id);
      return;
    }
    if (msg.type === "checkApiProfile") {
      const payload = sanitizeApiProfileInput(msg.payload);
      let apiKey = payload.apiKey;
      if (apiKey === "__use_saved__") {
        const apiState = await loadApiState(this.context);
        const selectedId = payload.id || apiState.activeId;
        apiKey = apiState.keyMap[selectedId] ?? "";
      }
      const result = await checkApiProfileAvailability(payload.apiBaseUrl, payload.model, apiKey);
      void webview.postMessage({
        type: "apiCheckResult",
        ok: result.ok,
        message: result.message,
      });
      return;
    }
    if (msg.type === "abort") {
      this.generationTokenSource?.cancel();
      this.generationTokenSource?.dispose();
      this.generationTokenSource = undefined;
      void webview.postMessage({ type: "generating", value: false });
      return;
    }
    if (msg.type === "generate") {
      await this.runGenerate(webview, msg.payload as GeneratePayload);
      return;
    }
    if (msg.type === "insertEditor") {
      const sql = typeof msg.payload === "string" ? msg.payload : "";
      await insertSqlToEditor(sql);
      return;
    }
    if (msg.type === "savePresetTables") {
      const payload = sanitizePresetConfigInput(msg.payload);
      const presetTables = sanitizePresetTables(payload.presetTables);
      const presetEvents = sanitizePresetEvents(payload.presetEvents);
      await this.context.globalState.update(STATE_PRESET_TABLES, presetTables);
      await this.context.globalState.update(STATE_PRESET_EVENTS, presetEvents);
      await this.postSettings(webview);
      void webview.postMessage({ type: "toast", message: "预设配置已保存。" });
      return;
    }
  }

  private async postSettings(webview: vscode.Webview): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("sqlGenerator");
    const apiState = await loadApiState(this.context);
    const activePlatformRaw = (this.context.globalState.get<string>(STATE_ACTIVE_PLATFORM) || PLATFORM_OPTIONS[0].id).trim();
    const activePlatform = PLATFORM_OPTIONS.some((p) => p.id === activePlatformRaw)
      ? activePlatformRaw
      : PLATFORM_OPTIONS[0].id;
    const platformPrompts = sanitizePlatformPromptMap(this.context.globalState.get<unknown>(STATE_PLATFORM_PROMPTS));
    const defaults = defaultProviderDefaults("deepseek");
    const presetTables = sanitizePresetTables(this.context.globalState.get<unknown>(STATE_PRESET_TABLES));
    const presetEvents = sanitizePresetEvents(this.context.globalState.get<unknown>(STATE_PRESET_EVENTS));
    const defaultByProvider: Record<string, { apiBaseUrl: string; model: string }> = {};
    for (const o of PROVIDER_OPTIONS) {
      defaultByProvider[o.id] = defaultProviderDefaults(o.id);
    }
    void webview.postMessage({
      type: "settings",
      settings: {
        temperature: cfg.get<number>("temperature") ?? 0.2,
        dialect: cfg.get<SqlDialect>("dialect") ?? "postgresql",
        activePlatform,
        platformOptions: PLATFORM_OPTIONS,
        platformPrompts,
        activeApiProfileId: apiState.activeId,
        apiProfiles: apiState.profiles.map((p) => ({
          ...p,
          maskedKey: maskApiKey(apiState.keyMap[p.id]),
          hasApiKey: Boolean((apiState.keyMap[p.id] ?? "").trim()),
        })),
        defaultApiForm: {
          provider: "deepseek",
          apiBaseUrl: defaults.apiBaseUrl,
          model: defaults.model,
        },
        providerOptions: PROVIDER_OPTIONS,
        defaultByProvider,
        modelCatalog: MODEL_CATALOG,
        presetTables,
        presetEvents,
      },
    });
  }

  private async runGenerate(webview: vscode.Webview, payload: GeneratePayload): Promise<void> {
    const apiState = await loadApiState(this.context);
    const apiProfileId = (payload.apiProfileId ?? apiState.activeId).trim();
    const profile = apiState.profiles.find((p) => p.id === apiProfileId);
    const apiKey = apiState.keyMap[apiProfileId] ?? "";
    if (!profile) {
      void webview.postMessage({
        type: "result",
        error: "请先保存并选择一个 API 配置。",
      });
      return;
    }
    if (!apiKey) {
      void webview.postMessage({
        type: "result",
        error: "当前 API 配置缺少 Key，请编辑后重新保存。",
      });
      return;
    }
    if (!profile.apiBaseUrl) {
      void webview.postMessage({
        type: "result",
        error: "当前 API 配置缺少 Base URL。",
      });
      return;
    }
    if (!profile.model) {
      void webview.postMessage({ type: "result", error: "当前 API 配置缺少模型。" });
      return;
    }

    const cfg = vscode.workspace.getConfiguration("sqlGenerator");
    const temperature =
      typeof payload.temperature === "number"
        ? payload.temperature
        : cfg.get<number>("temperature") ?? 0.2;

    this.generationTokenSource?.dispose();
    this.generationTokenSource = new vscode.CancellationTokenSource();
    const ac = new AbortController();
    const cancelSub = this.generationTokenSource.token.onCancellationRequested(() => ac.abort());

    void webview.postMessage({ type: "generating", value: true });
    void webview.postMessage({ type: "result", sql: "", clear: true });

    try {
      const dialect = payload.dialect ?? cfg.get<SqlDialect>("dialect") ?? "postgresql";
      const activePlatform = (
        payload.targetPlatform ||
        this.context.globalState.get<string>(STATE_ACTIVE_PLATFORM) ||
        PLATFORM_OPTIONS[0].id
      ).trim();
      const platformPrompts = sanitizePlatformPromptMap(this.context.globalState.get<unknown>(STATE_PLATFORM_PROMPTS));
      const system = buildSystemPrompt(dialect, platformPrompts[activePlatform] ?? "");
      const user = buildUserPrompt({ ...payload, dialect, targetPlatform: activePlatform });

      const sql = await chatCompletions({
        baseUrl: profile.apiBaseUrl,
        apiKey,
        model: profile.model,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        signal: ac.signal,
      });

      lastGeneratedSql = sql;
      void webview.postMessage({ type: "result", sql });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      void webview.postMessage({ type: "result", error: err });
    } finally {
      cancelSub.dispose();
      void webview.postMessage({ type: "generating", value: false });
      this.generationTokenSource?.dispose();
      this.generationTokenSource = undefined;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "style.css"));
    const csp = ["default-src 'none'", `style-src ${webview.cspSource}`, `script-src ${webview.cspSource}`].join("; ");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link href="${styleUri}" rel="stylesheet" />
  <title>SQL Generator</title>
</head>
<body>
  <div class="app">
    <section class="card">
      <h2>代码生成选项</h2>
      <label>SQL 方言</label>
      <select id="dialect">
        <option value="postgresql">PostgreSQL</option>
        <option value="mysql">MySQL</option>
        <option value="sqlserver">SQL Server</option>
        <option value="sqlite">SQLite</option>
        <option value="oracle">Oracle</option>
        <option value="generic">通用 / ANSI</option>
      </select>
      <label>温度</label>
      <input type="number" id="temperature" min="0" max="2" step="0.1" value="0.2" />
    </section>

    <section class="card">
      <h2>模型配置</h2>
      <details>
        <summary>模型配置（点击展开）</summary>
        <label>配置名称</label>
        <input type="text" id="apiProfileName" placeholder="例如：DeepSeek 生产" autocomplete="off" />
        <label>模型厂商</label>
        <select id="provider"></select>
        <label>API Base URL</label>
        <input type="text" id="apiBaseUrl" placeholder="https://..." autocomplete="off" />
        <label>模型</label>
        <select id="model"></select>
        <label>API Key（留空表示不覆盖原 key）</label>
        <input type="password" id="apiKey" placeholder="填写后点击保存" autocomplete="off" />
        <div class="row">
          <button type="button" id="saveApi" class="primary">保存 API 配置</button>
          <button type="button" id="checkApi" class="secondary">检查 URL/模型可用性</button>
        </div>
        <p id="apiCheckStatus" class="hint"></p>
      </details>
      <details>
        <summary>已保存 API（点击展开）</summary>
        <div id="savedApis"></div>
      </details>
    </section>

    <section class="card">
      <details>
        <summary>预设配置（点击展开）</summary>
        <div class="section-head">
          <h2>预设配置</h2>
        </div>
        <div class="parallel-cols">
          <div>
            <div class="section-head">
              <h2>预设表</h2>
              <button type="button" id="addPresetTable" class="small">+ 添加预设表</button>
            </div>
            <p class="hint">支持单元输入，也支持自然语言批量识别字段/注释。</p>
            <div id="presetTables"></div>
          </div>
          <div>
            <div class="section-head">
              <h2>预设事件</h2>
              <button type="button" id="addPresetEvent" class="small">+ 添加预设事件</button>
            </div>
            <p class="hint">可配置事件名、事件表与属性，供事件表模式直接下拉选择。</p>
            <div id="presetEvents"></div>
          </div>
        </div>
        <div class="row">
          <button type="button" id="savePresetTables" class="secondary">保存预设配置</button>
        </div>
      </details>
    </section>

    <section class="card">
      <div class="section-head">
        <h2>SQL编写配置</h2>
      </div>
      <div class="parallel-cols">
        <div>
          <h2>第一类：目标平台</h2>
          <label>目标平台</label>
          <select id="targetPlatform"></select>
          <label>该平台系统提示词（可编辑并保存）</label>
          <textarea id="platformSystemPrompt" rows="4" placeholder="为当前平台填写系统提示词，例如命名约定、事件约束等"></textarea>
          <div class="row">
            <button type="button" id="savePlatformPrompt" class="secondary">保存平台提示词</button>
          </div>
        </div>
        <div>
          <div class="section-head">
            <h2>第二类：表块选择</h2>
            <button type="button" id="addTable" class="small">+ 添加表</button>
          </div>
          <div id="tables"></div>
        </div>
        <div>
          <h2>第三类：结果描述方式</h2>
          <label>结果描述方式</label>
          <div class="row">
            <label><input type="radio" name="globalResultMode" id="globalModeGoal" value="goal" checked /> 自然语言目标</label>
            <label><input type="radio" name="globalResultMode" id="globalModeStructured" value="structured" /> 结构化结果描述</label>
          </div>
          <div id="globalGoalBlock">
            <label>自然语言目标（全局）</label>
            <textarea id="globalUserGoal" rows="4" placeholder="例如：按用户汇总订单金额，只保留 2024 年数据"></textarea>
          </div>
          <div id="globalStructuredBlock" style="display:none">
            <label>分组字段（全局，逗号分隔）</label>
            <input type="text" id="globalGroupByFields" placeholder="user_id, order_date" />
            <label>排序（全局）</label>
            <input type="text" id="globalOrderBy" placeholder="total_amount DESC, user_id ASC" />
            <label>聚合字段（全局，每行一项）</label>
            <textarea id="globalAggregateFields" rows="4" placeholder="total_amount: sum(amount)&#10;order_cnt: count(*)"></textarea>
          </div>
        </div>
      </div>
    </section>

    <div class="actions">
      <button type="button" id="generate" class="primary">生成 SQL</button>
      <button type="button" id="abort" disabled>停止</button>
      <button type="button" id="insertEditor" class="secondary">插入到当前编辑器</button>
    </div>

    <section class="card">
      <h2>输出</h2>
      <pre id="output" class="output"></pre>
    </section>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

export async function insertSqlToEditor(sql: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("没有活动编辑器。");
    return;
  }
  await editor.edit((b) => {
    b.insert(editor.selection.active, sql);
  });
}

interface PresetField {
  name: string;
  comment: string;
}

interface PresetEvent {
  id: string;
  tableName: string;
  eventName: string;
  attributes: PresetField[];
}

interface PresetTable {
  id: string;
  tableName: string;
  fields: PresetField[];
}

function sanitizePresetTables(input: unknown): PresetTable[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: PresetTable[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rawId = typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id.trim() : "";
    const tableName =
      typeof (item as { tableName?: unknown }).tableName === "string"
        ? (item as { tableName: string }).tableName.trim()
        : "";
    if (!tableName) {
      continue;
    }
    const rawFields = (item as { fields?: unknown }).fields;
    const fields = Array.isArray(rawFields)
      ? rawFields
          .map((f) => {
            if (!f || typeof f !== "object") {
              return null;
            }
            const name = typeof (f as { name?: unknown }).name === "string" ? (f as { name: string }).name.trim() : "";
            const comment =
              typeof (f as { comment?: unknown }).comment === "string" ? (f as { comment: string }).comment.trim() : "";
            if (!name) {
              return null;
            }
            return { name, comment };
          })
          .filter((f): f is PresetField => Boolean(f))
      : [];
    out.push({
      id: rawId || `preset_${Date.now()}_${out.length}`,
      tableName,
      fields,
    });
  }
  return out;
}

function sanitizePresetEvents(input: unknown): PresetEvent[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: PresetEvent[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rawId = typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id.trim() : "";
    const tableName =
      typeof (item as { tableName?: unknown }).tableName === "string"
        ? (item as { tableName: string }).tableName.trim()
        : "";
    const eventName =
      typeof (item as { eventName?: unknown }).eventName === "string"
        ? (item as { eventName: string }).eventName.trim()
        : "";
    if (!eventName) {
      continue;
    }
    const rawAttrs = (item as { attributes?: unknown }).attributes;
    const attributes = Array.isArray(rawAttrs)
      ? rawAttrs
          .map((f) => {
            if (!f || typeof f !== "object") {
              return null;
            }
            const name = typeof (f as { name?: unknown }).name === "string" ? (f as { name: string }).name.trim() : "";
            const comment =
              typeof (f as { comment?: unknown }).comment === "string" ? (f as { comment: string }).comment.trim() : "";
            if (!name) {
              return null;
            }
            return { name, comment };
          })
          .filter((f): f is PresetField => Boolean(f))
      : [];
    out.push({
      id: rawId || `preset_event_${Date.now()}_${out.length}`,
      tableName,
      eventName,
      attributes,
    });
  }
  return out;
}

function sanitizePresetConfigInput(input: unknown): { presetTables: unknown; presetEvents: unknown } {
  if (!input || typeof input !== "object") {
    return { presetTables: input, presetEvents: [] };
  }
  const src = input as Record<string, unknown>;
  return {
    presetTables: src.presetTables,
    presetEvents: src.presetEvents,
  };
}

interface ApiProfile {
  id: string;
  name: string;
  provider: LlmProviderId;
  apiBaseUrl: string;
  model: string;
  updatedAt: number;
}

interface ApiProfileInput {
  id: string;
  name: string;
  provider: string;
  apiBaseUrl: string;
  model: string;
  apiKey: string;
}

function sanitizeApiProfileInput(input: unknown): ApiProfileInput {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    id: typeof src.id === "string" ? src.id.trim() : "",
    name: typeof src.name === "string" ? src.name.trim() : "",
    provider: typeof src.provider === "string" ? src.provider.trim() : "deepseek",
    apiBaseUrl: typeof src.apiBaseUrl === "string" ? src.apiBaseUrl.trim() : "",
    model: typeof src.model === "string" ? src.model.trim() : "",
    apiKey: typeof src.apiKey === "string" ? src.apiKey.trim() : "",
  };
}

function sanitizeApiProfiles(input: unknown): ApiProfile[] {
  if (!Array.isArray(input)) return [];
  const out: ApiProfile[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    const id = typeof src.id === "string" ? src.id.trim() : "";
    const name = typeof src.name === "string" ? src.name.trim() : "";
    const provider = parseProviderId(typeof src.provider === "string" ? src.provider : "deepseek");
    const apiBaseUrl = typeof src.apiBaseUrl === "string" ? src.apiBaseUrl.trim() : "";
    const model = typeof src.model === "string" ? src.model.trim() : "";
    const updatedAt = typeof src.updatedAt === "number" ? src.updatedAt : 0;
    if (!id || !name) continue;
    out.push({ id, name, provider, apiBaseUrl, model, updatedAt });
  }
  return out;
}

function sanitizePlatformPromptInput(input: unknown): { platformId: string; systemPrompt: string } {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const platformId = typeof src.platformId === "string" ? src.platformId.trim() : PLATFORM_OPTIONS[0].id;
  const systemPrompt = typeof src.systemPrompt === "string" ? src.systemPrompt.trim() : "";
  return { platformId: platformId || PLATFORM_OPTIONS[0].id, systemPrompt };
}

function sanitizePlatformPromptMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const src = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (!k.trim()) continue;
    if (typeof v === "string") {
      out[k] = v.trim();
    }
  }
  return out;
}

type ApiState = { profiles: ApiProfile[]; activeId: string; keyMap: Record<string, string> };

async function loadApiState(context: vscode.ExtensionContext): Promise<ApiState> {
  const profiles = sanitizeApiProfiles(context.globalState.get<unknown>(STATE_API_PROFILES));
  const activeIdRaw = (context.globalState.get<string>(STATE_ACTIVE_API_PROFILE) ?? "").trim();
  const keyMap = await readApiKeyMap(context);
  if (profiles.length > 0) {
    return { profiles, activeId: activeIdRaw || profiles[0].id, keyMap };
  }
  const legacyKey = (await context.secrets.get(SECRET_KEY)) ?? "";
  const provider = parseProviderId(context.globalState.get<string>(STATE_PROVIDER) ?? "deepseek");
  const savedUrl = (context.globalState.get<string>(STATE_BASE_URL) ?? "").trim() || defaultProviderDefaults(provider).apiBaseUrl;
  const savedModel = (context.globalState.get<string>(STATE_MODEL) ?? "").trim() || defaultProviderDefaults(provider).model;
  const profile: ApiProfile = {
    id: "default_api",
    name: "默认 API",
    provider,
    apiBaseUrl: savedUrl,
    model: savedModel,
    updatedAt: Date.now(),
  };
  const next = [profile];
  const nextMap = { ...keyMap };
  if (legacyKey) {
    nextMap[profile.id] = legacyKey;
  }
  await context.globalState.update(STATE_API_PROFILES, next);
  await context.globalState.update(STATE_ACTIVE_API_PROFILE, profile.id);
  await writeApiKeyMap(context, nextMap);
  return { profiles: next, activeId: profile.id, keyMap: nextMap };
}

async function readApiKeyMap(context: vscode.ExtensionContext): Promise<Record<string, string>> {
  const raw = await context.secrets.get(SECRET_API_KEY_MAP);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeApiKeyMap(context: vscode.ExtensionContext, map: Record<string, string>): Promise<void> {
  await context.secrets.store(SECRET_API_KEY_MAP, JSON.stringify(map));
}

async function checkApiProfileAvailability(
  apiBaseUrl: string,
  model: string,
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  const modelName = model.trim();
  if (!base) {
    return { ok: false, message: "Base URL 为空。" };
  }
  if (!modelName) {
    return { ok: false, message: "模型名为空。" };
  }
  if (!apiKey.trim()) {
    return { ok: false, message: "API Key 为空。" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, message: `模型检查失败：HTTP ${res.status}` };
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (data.data ?? []).map((x) => String(x.id ?? "").trim()).filter(Boolean);
    if (ids.length === 0) {
      return { ok: true, message: "URL 可访问，但模型列表为空（可能需要平台侧授权）。" };
    }
    if (!ids.includes(modelName)) {
      return {
        ok: false,
        message: `URL 可访问，但模型「${modelName}」不在可用列表中。可用示例：${ids.slice(0, 6).join(", ")}`,
      };
    }
    return { ok: true, message: `检查通过：URL 可访问，模型「${modelName}」可用。` };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `检查失败：${err}` };
  } finally {
    clearTimeout(timeout);
  }
}
