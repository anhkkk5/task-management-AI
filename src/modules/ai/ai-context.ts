import type { AiMessageDoc } from "./ai-message.model";
import type { UserMemoryDoc } from "./user-memory.model";
import type {
  DiscussedSubtask,
  MemoryHint,
} from "./ai-intent";

/**
 * Domain detection for a parent task / subtask — maps to the same domain
 * taxonomy used by userMemoryService. Domain-agnostic by design: unknown
 * domain returns undefined (no slot filling) so other fields still work.
 */
export const detectDomainFromTask = (params: {
  parentTaskTitle?: string;
  parentTaskDescription?: string;
  subtaskTitle?: string;
  subtaskDescription?: string;
}): string | undefined => {
  const blob = [
    params.parentTaskTitle,
    params.parentTaskDescription,
    params.subtaskTitle,
    params.subtaskDescription,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!blob) return undefined;

  if (
    /\b(react|vue|angular|next|node|express|api|login|register|frontend|backend|ui|database|code|lập trình|coding|programming|javascript|typescript|python)\b/.test(
      blob,
    )
  ) {
    return "it";
  }
  if (
    /\b(english|tiếng anh|ielts|toeic|japanese|tiếng nhật|korean|tiếng hàn|french|tiếng pháp|chinese|tiếng trung|ngữ pháp|từ vựng|grammar|vocabulary)\b/.test(
      blob,
    )
  ) {
    return "language_learning";
  }
  if (
    /\b(figma|sketch|photoshop|wireframe|ui|ux|design|giao diện|mockup|prototype)\b/.test(
      blob,
    )
  ) {
    return "design";
  }
  if (
    /\b(marketing|sales|seo|content|funnel|pitch|business|kinh doanh|khách hàng|kpi|okr)\b/.test(
      blob,
    )
  ) {
    return "business";
  }
  return undefined;
};

/**
 * Slots required per domain. Each slot is ONE piece of info we want answered
 * before giving a deep answer. They're asked ONE at a time by the model.
 */
const DOMAIN_REQUIRED_SLOTS: Record<string, string[]> = {
  it: [
    "tech_stack (e.g. React / Vue / Angular / Next.js)",
    "programming_language (e.g. JavaScript / TypeScript / Python)",
  ],
  language_learning: [
    "learning_language (e.g. English / Japanese / Korean)",
    "current_level (beginner / intermediate / advanced)",
  ],
  design: ["design_tool (e.g. Figma / Sketch / Photoshop)"],
  business: ["target_audience", "goal_metric (revenue / leads / awareness)"],
};

/**
 * Detect which slots are still unknown given: user memories + conversation history.
 * We consider a slot "known" if EITHER:
 *  - a UserMemory entry has a matching key prefix, OR
 *  - conversation history text mentions any token from the slot hint.
 */
export const computePendingSlots = (params: {
  domain?: string;
  memories: UserMemoryDoc[];
  history: AiMessageDoc[];
}): string[] => {
  if (!params.domain) return [];
  const slots = DOMAIN_REQUIRED_SLOTS[params.domain];
  if (!slots?.length) return [];

  const knownKeys = new Set(params.memories.map((m) => m.key.toLowerCase()));
  const historyBlob = params.history
    .map((m) => m.content)
    .join("\n")
    .toLowerCase();

  return slots.filter((slotHint) => {
    // Slot hint format: "slot_key (examples)"
    const keyMatch = /^([a-z_]+)/.exec(slotHint);
    const slotKey = keyMatch ? keyMatch[1] : slotHint;
    if (knownKeys.has(slotKey)) return false;

    // Also consider known if we see example tokens in the history
    const exampleMatch = /\(([^)]+)\)/.exec(slotHint);
    if (exampleMatch) {
      const tokens = exampleMatch[1]
        .split(/[\/,]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      for (const t of tokens) {
        if (!t || t.length < 2) continue;
        if (historyBlob.includes(t)) return false;
      }
    }
    return true;
  });
};

/**
 * Build the list of subtasks previously discussed in the same conversation,
 * derived from messages tagged with meta.subtaskTitle.
 */
export const buildDiscussedSubtasks = (
  history: AiMessageDoc[],
): DiscussedSubtask[] => {
  const byKey = new Map<
    string,
    { title: string; index?: number; lastDiscussedAt: Date }
  >();
  for (const m of history) {
    const meta = m.meta;
    if (!meta?.subtaskTitle) continue;
    const key = meta.subtaskKey || meta.subtaskTitle;
    const prev = byKey.get(key);
    if (!prev || m.createdAt > prev.lastDiscussedAt) {
      byKey.set(key, {
        title: meta.subtaskTitle,
        index: meta.subtaskIndex,
        lastDiscussedAt: m.createdAt,
      });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.lastDiscussedAt.getTime() - b.lastDiscussedAt.getTime(),
  );
};

/** Map UserMemoryDoc → prompt-friendly hints */
export const toMemoryHints = (memories: UserMemoryDoc[]): MemoryHint[] =>
  memories.map((m) => ({
    key: m.key,
    value: m.value,
    scope: m.scope,
    domain: m.domain,
    occurrences: m.occurrences,
    lastSeenAt: m.lastSeenAt,
  }));
