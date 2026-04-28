/**
 * ai-chat-draft.ts
 * -----------------
 * Proposal-draft manipulation logic extracted from ai-chat.service.ts.
 * Responsible for merging tool results into the in-memory ProposalDraft
 * that is persisted in the conversation context and later consumed by
 * commit_proposal.
 */

import type { ProposalDraft, ProposalDraftItem } from "./ai-conversation.model";

// ─── Map raw proposal array to draft session format ──────────────────────────

export const mapDraftSessions = (
  proposals: any[] | undefined,
): { date: string; start: string; end: string; focus?: string }[] =>
  Array.isArray(proposals)
    ? proposals.map((p: any) => ({
        date: String(p?.date || ""),
        start: String(p?.start || ""),
        end: String(p?.end || ""),
        focus: undefined,
      }))
    : [];

// ─── Upsert a single activity into the items array (by name) ─────────────────

export const upsertProposalItem = (
  items: ProposalDraftItem[],
  candidate: ProposalDraftItem,
): ProposalDraftItem[] => {
  const key = candidate.activityName.trim().toLowerCase();
  const idx = items.findIndex(
    (x) => x.activityName.trim().toLowerCase() === key,
  );
  if (idx >= 0) {
    const next = [...items];
    next[idx] = candidate;
    return next;
  }
  return [...items, candidate];
};

// ─── Merge propose_schedule tool output into existing draft ──────────────────

export const mergeProposalDraftFromTool = (
  currentDraft: ProposalDraft | undefined,
  callArguments: string,
  executedContent: string,
): ProposalDraft | undefined => {
  let args: any = {};
  let output: any = {};
  try {
    args = JSON.parse(callArguments || "{}");
  } catch {
    args = {};
  }
  try {
    output = JSON.parse(executedContent || "{}");
  } catch {
    output = {};
  }

  const incomingItems: ProposalDraftItem[] = [];

  if (Array.isArray(output?.items) && output.items.length > 0) {
    for (const item of output.items) {
      const activityName = String(item?.activityName || "").trim();
      const sessions = mapDraftSessions(item?.proposals);
      if (!activityName || sessions.length === 0) continue;
      incomingItems.push({
        activityName,
        durationMin: Number(item?.durationMin || args?.durationMin || 0),
        sessionsPerWeek: Number(item?.sessionsPerWeek || 0),
        windowStart: String(args?.windowStart || ""),
        windowEnd: String(args?.windowEnd || ""),
        daysAllowed: Array.isArray(args?.daysAllowed)
          ? args.daysAllowed.map((x: unknown) => String(x))
          : undefined,
        minGapDays: Number(args?.minGapDays ?? 0),
        sessions,
      });
    }
  } else {
    const sessions = mapDraftSessions(output?.proposals);
    const activityName = String(
      args?.activityName || output?.activityName || "",
    ).trim();
    if (activityName && sessions.length > 0) {
      incomingItems.push({
        activityName,
        durationMin: Number(args?.durationMin || output?.durationMin || 0),
        sessionsPerWeek: Number(
          args?.sessionsPerWeek || output?.sessionsPerWeek || 0,
        ),
        windowStart: String(args?.windowStart || ""),
        windowEnd: String(args?.windowEnd || ""),
        daysAllowed: Array.isArray(args?.daysAllowed)
          ? args.daysAllowed.map((x: unknown) => String(x))
          : undefined,
        minGapDays: Number(args?.minGapDays ?? 0),
        sessions,
      });
    }
  }

  if (incomingItems.length === 0) return currentDraft;

  let nextItems: ProposalDraftItem[] = [];
  if (currentDraft) {
    if (Array.isArray(currentDraft.items) && currentDraft.items.length > 0) {
      nextItems = [...currentDraft.items];
    } else if (
      Array.isArray(currentDraft.sessions) &&
      currentDraft.sessions.length > 0
    ) {
      nextItems = [
        {
          activityName: currentDraft.activityName,
          durationMin: currentDraft.durationMin,
          sessionsPerWeek: currentDraft.sessionsPerWeek,
          windowStart: currentDraft.windowStart,
          windowEnd: currentDraft.windowEnd,
          daysAllowed: currentDraft.daysAllowed,
          minGapDays: currentDraft.minGapDays,
          sessions: currentDraft.sessions,
        },
      ];
    }
  }

  for (const item of incomingItems) {
    nextItems = upsertProposalItem(nextItems, item);
  }

  if (nextItems.length === 0) return currentDraft;

  const primary = nextItems[0];
  return {
    activityName: primary.activityName,
    durationMin: primary.durationMin,
    sessionsPerWeek: primary.sessionsPerWeek,
    windowStart: primary.windowStart,
    windowEnd: primary.windowEnd,
    daysAllowed: primary.daysAllowed,
    minGapDays: primary.minGapDays,
    sessions: primary.sessions,
    items: nextItems.length > 1 ? nextItems : undefined,
    createdAt: new Date(),
  };
};
