"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSystemPrompt = buildSystemPrompt;
exports.buildUserPrompt = buildUserPrompt;
const dialectHints = {
    postgresql: "使用 PostgreSQL 语法（双引号标识符仅在必要时使用，优先小写未加引号表名列名）。",
    mysql: "使用 MySQL/MariaDB 语法。",
    sqlserver: "使用 Microsoft SQL Server (T-SQL) 语法。",
    sqlite: "使用 SQLite 语法。",
    oracle: "使用 Oracle SQL 语法。",
    generic: "使用标准 SQL，避免方言特有函数；若必须函数，在注释中说明等价写法。",
};
function buildSystemPrompt(dialect, platformSystemPrompt) {
    const base = [
        "你是资深数据库工程师，根据用户提供的表结构元数据与目标，生成可直接执行的 SQL。",
        dialectHints[dialect] ?? dialectHints.generic,
        "规则：",
        "- 只输出 SQL，不要 Markdown 代码块，不要前言后语。",
        "- 若需多语句，用分号分隔；必要时使用 CTE（WITH）保持可读。",
        "- 字段名以用户给出的为准；未给出的列不要臆造，若信息不足用单行 SQL 注释 -- TODO: 说明缺什么。",
        "- 若用户使用「结果描述」模式：优先遵循分组字段、排序与聚合字段约束构建 SELECT。",
        "- 若用户使用「自然语言目标」模式：基于目标解释合理的查询结果形状。",
        "- 若出现事件表，请优先按事件名筛选（通常在 WHERE 条件中约束事件字段），再选择该事件可用属性。",
    ];
    const custom = (platformSystemPrompt ?? "").trim();
    if (custom) {
        base.push("", "平台定制系统提示词：", custom);
    }
    return base.join("\n");
}
function buildUserPrompt(payload) {
    const blocks = payload.tables.map((t, i) => {
        const mode = t.resultMode === "goal" ? "自然语言目标" : "结果描述（结构化）";
        const goal = (t.userGoal ?? "").trim();
        const groupBy = t.resultSpec?.groupByFields?.join(", ") ?? "";
        const orderBy = t.resultSpec?.orderBy?.trim() ?? "";
        const aggregateFields = t.resultSpec?.aggregateFields?.join(", ") ?? "";
        if (t.sourceKind === "event") {
            const eventLines = (t.events ?? [])
                .map((ev) => {
                const attrs = ev.attributes?.map((a) => `${a.name}${a.comment ? `: ${a.comment}` : ""}`).join(", ") || "(无属性)";
                return `  - 事件: ${ev.eventName || "(未命名)"}\n    属性: ${attrs}`;
            })
                .join("\n");
            return [
                `【表 ${i + 1}】`,
                "表来源: 事件表",
                `事件表名: ${t.eventTableName || t.baseTable || "(未命名)"}`,
                "事件列表:",
                eventLines || "  - (无事件，需谨慎生成)",
                "事件表示例语法: SELECT \"#user_id\",\"w_area\" FROM v_event_9 WHERE \"$part_event\"='auto_pay_v2_success'",
                `结果输入模式: ${mode}`,
                t.resultMode === "goal"
                    ? `自然语言目标: ${goal || "(未填写，需根据字段合理推断)"}`
                    : `分组字段: ${groupBy || "(可空)"}`,
                t.resultMode === "goal" ? "" : `排序: ${orderBy || "(未指定)"}`,
                t.resultMode === "goal"
                    ? ""
                    : `聚合字段（预期结果字段）: ${aggregateFields || "(未指定，需按字段合理推断)"}`,
            ].join("\n");
        }
        const fieldLines = t.fields.map((f) => `  - ${f.name}: ${f.comment || "(无注释)"}`).join("\n");
        return [
            `【表 ${i + 1}】`,
            `表来源: ${t.sourceKind === "preset" ? "预设表" : "新表"}`,
            `基础表名: ${t.baseTable || "(未命名)"}`,
            "字段:",
            fieldLines || "  - (无字段，请根据目标谨慎处理)",
            `结果输入模式: ${mode}`,
            t.resultMode === "goal"
                ? `自然语言目标: ${goal || "(未填写，需根据字段合理推断)"}`
                : `分组字段: ${groupBy || "(可空)"}`,
            t.resultMode === "goal" ? "" : `排序: ${orderBy || "(未指定)"}`,
            t.resultMode === "goal"
                ? ""
                : `聚合字段（预期结果字段）: ${aggregateFields || "(未指定，需按字段合理推断)"}`,
        ].join("\n");
    });
    return [
        `SQL 方言: ${payload.dialect}`,
        `目标平台: ${payload.targetPlatform || "generic"}`,
        "",
        "用户需求与表规格:",
        "",
        ...blocks,
    ].join("\n");
}
//# sourceMappingURL=buildPrompt.js.map