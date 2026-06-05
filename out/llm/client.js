"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatCompletions = chatCompletions;
function normalizeBaseUrl(url) {
    return url.replace(/\/+$/, "");
}
async function chatCompletions(options) {
    const url = `${normalizeBaseUrl(options.baseUrl)}/chat/completions`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
            model: options.model,
            messages: options.messages,
            temperature: options.temperature,
        }),
        signal: options.signal,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 2000)}`);
    }
    const data = (await res.json());
    if (data.error?.message) {
        throw new Error(data.error.message);
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
        throw new Error("模型返回为空或格式异常。");
    }
    return stripMarkdownSqlFence(content.trim());
}
function stripMarkdownSqlFence(text) {
    const m = text.match(/^```(?:sql)?\s*([\s\S]*?)```$/i);
    return m ? m[1].trim() : text;
}
//# sourceMappingURL=client.js.map