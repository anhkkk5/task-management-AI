"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userMemoryService = exports.extractMemoriesFromUtterance = void 0;
const ai_repository_1 = require("./ai.repository");
// ─── Domain detectors ─────────────────────────────────────────────────────────
const DOMAIN_PATTERNS = [
    {
        domain: "it",
        re: /\b(react|vue|angular|next\.?js|nuxt|svelte|node\.?js|express|nestjs|django|flask|fastapi|spring|laravel|rails|docker|kubernetes|typescript|javascript|python|java|golang|rust|c\+\+|c#|php|ruby|frontend|backend|fullstack|devops|api|database|mongo|postgres|mysql|redis)\b/i,
    },
    {
        domain: "language_learning",
        re: /\b(english|ielts|toeic|toefl|tiếng anh|japanese|日本語|jlpt|korean|한국어|topik|french|français|delf|chinese|中文|hsk)\b/i,
    },
    {
        domain: "design",
        re: /\b(figma|sketch|photoshop|illustrator|xd|wireframe|ui|ux|prototype|mockup|design system)\b/i,
    },
    {
        domain: "business",
        re: /\b(marketing|sales|seo|content|funnel|crm|kpi|okr|pitch deck|business plan)\b/i,
    },
];
const detectDomain = (text) => {
    for (const d of DOMAIN_PATTERNS) {
        if (d.re.test(text))
            return d.domain;
    }
    return undefined;
};
const TECH_TOKENS = [
    "react",
    "vue",
    "angular",
    "nextjs",
    "next.js",
    "nuxt",
    "svelte",
    "nodejs",
    "node.js",
    "express",
    "nestjs",
    "django",
    "flask",
    "fastapi",
    "spring",
    "laravel",
    "rails",
    "docker",
    "kubernetes",
    "mongodb",
    "postgres",
    "postgresql",
    "mysql",
    "redis",
    "tailwind",
    "bootstrap",
    "mui",
    "antd",
    "shadcn",
];
const PROGRAMMING_LANG_TOKENS = [
    "javascript",
    "typescript",
    "python",
    "java",
    "golang",
    "go",
    "rust",
    "c++",
    "c#",
    "php",
    "ruby",
    "kotlin",
    "swift",
    "dart",
];
const SPOKEN_LANG_TOKENS = [
    "english",
    "vietnamese",
    "japanese",
    "korean",
    "french",
    "chinese",
    "tiếng anh",
    "tiếng nhật",
    "tiếng hàn",
    "tiếng pháp",
    "tiếng trung",
];
const TOOL_TOKENS = [
    "figma",
    "sketch",
    "photoshop",
    "illustrator",
    "notion",
    "jira",
    "trello",
    "slack",
    "vscode",
    "intellij",
    "postman",
];
// "tôi dùng X" / "mình xài X" / "i use X" / "sử dụng X" / "chọn X" / "prefer X"
const USE_VERBS = [
    "dùng",
    "xài",
    "sử dụng",
    "sử-dụng",
    "chọn",
    "đang học",
    "đang làm",
    "học",
    "code bằng",
    "viết bằng",
    "use",
    "using",
    "prefer",
    "work with",
    "working with",
    "learn",
    "learning",
    "study",
    "studying",
];
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matchPreferenceInList = (text, list) => {
    const lower = text.toLowerCase();
    for (const verb of USE_VERBS) {
        const idx = lower.indexOf(verb);
        if (idx === -1)
            continue;
        // Slice 40 chars after verb to capture the object
        const tail = lower.slice(idx, idx + verb.length + 40);
        for (const token of list) {
            const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
            if (re.test(tail))
                return token;
        }
    }
    // Fallback: if user simply says the token alone in a short sentence
    if (text.trim().split(/\s+/).length <= 5) {
        for (const token of list) {
            const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
            if (re.test(text))
                return token;
        }
    }
    return undefined;
};
const detectTechStack = (text) => {
    const v = matchPreferenceInList(text, TECH_TOKENS);
    return v
        ? [
            {
                scope: "preference",
                key: "tech_stack",
                value: v,
                domain: "it",
                confidence: 0.75,
            },
        ]
        : [];
};
const detectProgrammingLanguage = (text) => {
    const v = matchPreferenceInList(text, PROGRAMMING_LANG_TOKENS);
    return v
        ? [
            {
                scope: "preference",
                key: "programming_language",
                value: v,
                domain: "it",
                confidence: 0.75,
            },
        ]
        : [];
};
const detectSpokenLanguage = (text) => {
    const v = matchPreferenceInList(text, SPOKEN_LANG_TOKENS);
    return v
        ? [
            {
                scope: "preference",
                key: "learning_language",
                value: v,
                domain: "language_learning",
                confidence: 0.7,
            },
        ]
        : [];
};
const detectTool = (text) => {
    const v = matchPreferenceInList(text, TOOL_TOKENS);
    return v
        ? [
            {
                scope: "preference",
                key: "tool",
                value: v,
                confidence: 0.65,
            },
        ]
        : [];
};
// "tôi là/i am X (role)"
const detectRole = (text) => {
    const m = /(?:tôi là|mình là|em là|i am|i'm)\s+(?:một\s+|a\s+|an\s+)?([\p{L}\s-]{3,40}?)(?:[.,!?]|$)/iu.exec(text);
    if (!m)
        return [];
    const value = m[1].trim();
    if (value.length < 3)
        return [];
    return [
        {
            scope: "fact",
            key: "role",
            value,
            confidence: 0.5,
        },
    ];
};
const DETECTORS = [
    detectTechStack,
    detectProgrammingLanguage,
    detectSpokenLanguage,
    detectTool,
    detectRole,
];
const extractMemoriesFromUtterance = (text) => {
    if (!text || text.length < 2)
        return [];
    const domain = detectDomain(text);
    const results = [];
    for (const d of DETECTORS) {
        for (const m of d(text, domain)) {
            // Attach detected domain if extractor didn't set one
            results.push(m.domain ? m : { ...m, domain });
        }
    }
    // Deduplicate by key+value
    const seen = new Set();
    return results.filter((m) => {
        const k = `${m.key}:${m.value}`.toLowerCase();
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
};
exports.extractMemoriesFromUtterance = extractMemoriesFromUtterance;
exports.userMemoryService = {
    /**
     * Persist memories extracted from a single user utterance.
     * Silent-fails on DB errors to avoid breaking chat flow.
     */
    ingestUtterance: async (userId, text) => {
        try {
            const memories = (0, exports.extractMemoriesFromUtterance)(text);
            for (const m of memories) {
                await ai_repository_1.aiRepository.upsertUserMemory({
                    userId,
                    scope: m.scope,
                    key: m.key,
                    value: m.value,
                    domain: m.domain,
                    confidence: m.confidence,
                });
            }
        }
        catch (err) {
            console.warn("[userMemoryService] ingestUtterance failed:", err);
        }
    },
    /**
     * Load relevant memories to inject into prompt.
     * Prioritizes preferences + facts, filtered by domain when supplied.
     */
    loadRelevantMemories: async (userId, domain, limit = 20) => {
        // First domain-scoped
        const scoped = domain
            ? await ai_repository_1.aiRepository.listUserMemories({
                userId,
                scopes: ["preference", "fact"],
                domain,
                limit,
            })
            : [];
        if (scoped.length >= limit)
            return scoped.slice(0, limit);
        // Fill with cross-domain preferences
        const rest = await ai_repository_1.aiRepository.listUserMemories({
            userId,
            scopes: ["preference", "fact"],
            limit: limit - scoped.length + 10,
        });
        const seen = new Set(scoped.map((m) => `${m.key}:${m.value}`));
        for (const m of rest) {
            const k = `${m.key}:${m.value}`;
            if (seen.has(k))
                continue;
            seen.add(k);
            scoped.push(m);
            if (scoped.length >= limit)
                break;
        }
        return scoped;
    },
};
