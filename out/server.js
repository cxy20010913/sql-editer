"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path = __importStar(require("path"));
const client_1 = require("./llm/client");
const buildPrompt_1 = require("./prompts/buildPrompt");
const app = (0, express_1.default)();
const port = process.env.PORT ? Number(process.env.PORT) : 4173;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "1mb" }));
// Static files: simple web frontend
const publicDir = path.join(__dirname, "..", "web");
app.use(express_1.default.static(publicDir));
app.post("/api/generate", async (req, res) => {
    const body = req.body;
    const { apiBaseUrl, apiKey, model, dialect, tables, temperature } = body;
    if (!apiKey) {
        res.status(400).json({ error: "缺少 apiKey。" });
        return;
    }
    if (!apiBaseUrl) {
        res.status(400).json({ error: "缺少 apiBaseUrl。" });
        return;
    }
    if (!model) {
        res.status(400).json({ error: "缺少 model。" });
        return;
    }
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
        res.status(400).json({ error: "缺少表规格（tables）。" });
        return;
    }
    try {
        const dialectSafe = dialect ?? "postgresql";
        const system = (0, buildPrompt_1.buildSystemPrompt)(dialectSafe);
        const user = (0, buildPrompt_1.buildUserPrompt)({
            dialect: dialectSafe,
            tables,
            temperature,
        });
        const sql = await (0, client_1.chatCompletions)({
            baseUrl: apiBaseUrl,
            apiKey,
            model,
            temperature: typeof temperature === "number" ? temperature : 0.2,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
        });
        res.json({ sql });
    }
    catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: err });
    }
});
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`SQL Generator web server listening on http://localhost:${port}`);
});
//# sourceMappingURL=server.js.map