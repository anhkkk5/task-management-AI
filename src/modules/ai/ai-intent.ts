// ─── Language types ───────────────────────────────────────────────────────────
export type Lang = "vi" | "en" | "jp" | "fr" | "ko" | "zh" | "unknown";

const LANG_NAMES: Record<Lang, string> = {
  vi: "Vietnamese",
  en: "English",
  jp: "Japanese",
  fr: "French",
  ko: "Korean",
  zh: "Chinese",
  unknown: "the same language as the user",
};

// ─── Detect user language from message ───────────────────────────────────────
export function detectUserLanguage(text: string): Lang {
  if (
    /[àáạảãăắằẳẵặâấầẩẫậđèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹ]/i.test(
      text,
    )
  ) {
    return "vi";
  }
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) {
    return "jp";
  }
  if (/[\uAC00-\uD7AF]/.test(text)) {
    return "ko";
  }
  if (/[àâçèéêëîïôùûüÿœæ]/i.test(text)) {
    return "fr";
  }
  if (/[a-zA-Z]/.test(text)) {
    return "en";
  }
  return "unknown";
}

// ─── Resolve target learning language from context ───────────────────────────
export function resolveTargetLanguage(subtaskContext?: {
  parentTaskTitle?: string;
  subtaskTitle?: string;
}): Lang {
  if (!subtaskContext) return "en";

  const combined =
    `${subtaskContext.parentTaskTitle || ""} ${subtaskContext.subtaskTitle || ""}`.toLowerCase();

  if (/tiếng anh|english|ielts|toeic|toefl/.test(combined)) return "en";
  if (/tiếng nhật|japanese|日本語/.test(combined)) return "jp";
  if (/tiếng hàn|korean|한국어/.test(combined)) return "ko";
  if (/tiếng pháp|french|français/.test(combined)) return "fr";
  if (/tiếng trung|chinese|中文|普通话/.test(combined)) return "zh";

  return "en"; // default
}

// ─── Intent Detection ─────────────────────────────────────────────────────────
export type ChatIntent = "EXERCISE" | "CHECK_ANSWER" | "EXPLAIN" | "CHAT";

export function detectIntent(message: string): ChatIntent {
  const text = message.toLowerCase();

  if (
    /\b(đáp án|answer|correct|wrong|check|chấm|kiểm tra|tôi nghĩ|i think|my answer|câu trả lời)\b/.test(
      text,
    )
  ) {
    return "CHECK_ANSWER";
  }
  if (
    /\b(bài tập|exercise|practice|quiz|test|cho.*bài|give.*exercise|tạo.*bài|generate|luyện tập|drill)\b/.test(
      text,
    )
  ) {
    return "EXERCISE";
  }
  if (
    /\b(giải thích|explain|what is|là gì|nghĩa là|how to|cách|tại sao|why|define|định nghĩa|lý thuyết|theory)\b/.test(
      text,
    )
  ) {
    return "EXPLAIN";
  }
  return "CHAT";
}

// ─── Build system prompt (2-layer language system) ────────────────────────────
export function buildSystemPrompt(params: {
  userLang: Lang;
  targetLang: Lang;
  intent: ChatIntent;
  subtaskContext?: {
    subtaskTitle?: string;
    parentTaskTitle?: string;
    parentTaskDescription?: string;
    estimatedDuration?: number;
    parentEstimatedDuration?: number;
    dailyTargetMin?: number;
    dailyTargetDuration?: number;
    difficulty?: string;
    description?: string;
  };
  customSystemPrompt?: string;
}): string {
  const { userLang, targetLang, intent, subtaskContext, customSystemPrompt } =
    params;
  const userLangName = LANG_NAMES[userLang];
  const targetLangName = LANG_NAMES[targetLang];

  // If FE provides custom system prompt, use it but inject language rules
  if (customSystemPrompt) {
    return (
      customSystemPrompt +
      `\n\n=====================\nFINAL LANGUAGE RULES (HIGHEST PRIORITY - OVERRIDE EVERYTHING):\n` +
      `- Explanation & feedback: MUST be in ${userLangName}\n` +
      `- Exercises & examples: MUST be in ${targetLangName}\n` +
      `- NEVER translate exercises into ${userLangName}\n` +
      `- DO NOT mix languages in the same section`
    );
  }

  const base = `You are a highly intelligent AI assistant integrated in TaskMind AI.

CORE CAPABILITIES:
- Teaching languages, math, physics, programming, and more
- Answering knowledge questions across all domains
- Casual conversation and life advice
- Task planning and productivity support`;

  const languageConfig = `
=====================
LANGUAGE CONFIG:
- User Language: ${userLangName}
- Target Learning Language: ${targetLangName}

STRICT LANGUAGE RULES (HIGHEST PRIORITY):
1. Explanation & feedback → MUST be in ${userLangName}
2. Examples & Exercises → MUST be in ${targetLangName}
3. Answers → MUST be in ${targetLangName}
4. NEVER translate exercises into ${userLangName}
5. NEVER mix languages in the same section`;

  const intentPrompts: Record<ChatIntent, string> = {
    EXERCISE: `
=====================
CURRENT MODE: EXERCISE GENERATOR

When user asks for exercises on MULTIPLE tenses/topics, create ONE SECTION PER TENSE with this format:

---

## 🕐 [Tense Name] (e.g. Present Simple)

**Fill in the blank:**
1. She ___ (go) to school every day.
2. They ___ (play) football on Sundays.

**Multiple choice:**
1. She ___ coffee every morning.

   > A. drink
   > B. drinks ✓
   > C. drinking

2. They ___ in London.

   > A. lives
   > B. live ✓
   > C. living

**Answers:** 1. goes  2. play

---

## 🕑 [Next Tense Name]
(repeat same structure)

---

CRITICAL RULES:
- Each tense MUST have its own ## heading section
- Multiple choice options MUST be on SEPARATE LINES with > prefix
- NEVER put options on the same line as the question
- Exercises MUST be in ${targetLangName}
- Minimum 3 exercises per tense
- Always include answers at the end of each section`,

    CHECK_ANSWER: `
=====================
CURRENT MODE: ANSWER CHECKER

When student submits answers, respond in this format:

**Results:**
1. ✅ Correct / ❌ Incorrect — [brief explanation in ${userLangName}]
2. ✅ Correct / ❌ Incorrect — [brief explanation in ${userLangName}]

**Score:** X/Y correct

**Feedback:** (encouraging message in ${userLangName})`,

    EXPLAIN: `
=====================
CURRENT MODE: TUTOR

Structure your response as:

**[Concept Name]**

📌 **Definition:** (in ${userLangName})

📝 **Structure:** ...

✅ **Examples:** (in ${targetLangName})
- Example 1
- Example 2

⚠️ **Common mistakes:** (in ${targetLangName})

💡 **Tips:** (in ${userLangName})`,

    CHAT: `
=====================
CURRENT MODE: ASSISTANT

- Respond naturally and conversationally in ${userLangName}
- Be helpful and concise
- Don't be robotic`,
  };

  let prompt = base + languageConfig + intentPrompts[intent];

  // Add learning context if available
  if (subtaskContext) {
    const durationStr = subtaskContext.estimatedDuration
      ? `${subtaskContext.estimatedDuration} min`
      : "";
    const totalStr = subtaskContext.parentEstimatedDuration
      ? `${Math.round((subtaskContext.parentEstimatedDuration / 60) * 10) / 10}h`
      : "";
    const dailyStr =
      subtaskContext.dailyTargetMin && subtaskContext.dailyTargetDuration
        ? `${Math.round((subtaskContext.dailyTargetMin / 60) * 10) / 10}h-${Math.round((subtaskContext.dailyTargetDuration / 60) * 10) / 10}h/day`
        : "";

    prompt +=
      `\n\n=====================\nLEARNING CONTEXT:\n` +
      `- Topic: "${subtaskContext.subtaskTitle}"\n` +
      `- Learning path: "${subtaskContext.parentTaskTitle}"\n` +
      (subtaskContext.parentTaskDescription
        ? `- Description: ${subtaskContext.parentTaskDescription}\n`
        : "") +
      (durationStr ? `- Time for this step: ${durationStr}\n` : "") +
      (totalStr ? `- Total path duration: ${totalStr}\n` : "") +
      (dailyStr ? `- Daily goal: ${dailyStr}\n` : "") +
      (subtaskContext.difficulty
        ? `- Difficulty: ${subtaskContext.difficulty}\n`
        : "") +
      (subtaskContext.description
        ? `- Step content: ${subtaskContext.description}\n`
        : "");
  }

  return prompt;
}
