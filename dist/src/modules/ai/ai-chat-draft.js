"use strict";
/**
 * ai-chat-draft.ts
 * -----------------
 * Proposal-draft manipulation logic extracted from ai-chat.service.ts.
 * Responsible for merging tool results into the in-memory ProposalDraft
 * that is persisted in the conversation context and later consumed by
 * commit_proposal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeProposalDraftFromTool = exports.upsertProposalItem = exports.mapDraftSessions = void 0;
// ─── Map raw proposal array to draft session format ──────────────────────────
const mapDraftSessions = (proposals) => Array.isArray(proposals)
    ? proposals.map((p) => ({
        date: String(p?.date || ""),
        start: String(p?.start || ""),
        end: String(p?.end || ""),
        focus: undefined,
    }))
    : [];
exports.mapDraftSessions = mapDraftSessions;
// ─── Upsert a single activity into the items array (by name) ─────────────────
const upsertProposalItem = (items, candidate) => {
    const key = candidate.activityName.trim().toLowerCase();
    const idx = items.findIndex((x) => x.activityName.trim().toLowerCase() === key);
    if (idx >= 0) {
        const next = [...items];
        next[idx] = candidate;
        return next;
    }
    return [...items, candidate];
};
exports.upsertProposalItem = upsertProposalItem;
// ─── Merge propose_schedule tool output into existing draft ──────────────────
const mergeProposalDraftFromTool = (currentDraft, callArguments, executedContent) => {
    let args = {};
    let output = {};
    try {
        args = JSON.parse(callArguments || "{}");
    }
    catch {
        args = {};
    }
    try {
        output = JSON.parse(executedContent || "{}");
    }
    catch {
        output = {};
    }
    const incomingItems = [];
    if (Array.isArray(output?.items) && output.items.length > 0) {
        for (const item of output.items) {
            const activityName = String(item?.activityName || "").trim();
            const sessions = (0, exports.mapDraftSessions)(item?.proposals);
            if (!activityName || sessions.length === 0)
                continue;
            incomingItems.push({
                activityName,
                durationMin: Number(item?.durationMin || args?.durationMin || 0),
                sessionsPerWeek: Number(item?.sessionsPerWeek || 0),
                windowStart: String(args?.windowStart || ""),
                windowEnd: String(args?.windowEnd || ""),
                daysAllowed: Array.isArray(args?.daysAllowed)
                    ? args.daysAllowed.map((x) => String(x))
                    : undefined,
                minGapDays: Number(args?.minGapDays ?? 0),
                sessions,
            });
        }
    }
    else {
        const sessions = (0, exports.mapDraftSessions)(output?.proposals);
        const activityName = String(args?.activityName || output?.activityName || "").trim();
        if (activityName && sessions.length > 0) {
            incomingItems.push({
                activityName,
                durationMin: Number(args?.durationMin || output?.durationMin || 0),
                sessionsPerWeek: Number(args?.sessionsPerWeek || output?.sessionsPerWeek || 0),
                windowStart: String(args?.windowStart || ""),
                windowEnd: String(args?.windowEnd || ""),
                daysAllowed: Array.isArray(args?.daysAllowed)
                    ? args.daysAllowed.map((x) => String(x))
                    : undefined,
                minGapDays: Number(args?.minGapDays ?? 0),
                sessions,
            });
        }
    }
    if (incomingItems.length === 0)
        return currentDraft;
    let nextItems = [];
    if (currentDraft) {
        if (Array.isArray(currentDraft.items) && currentDraft.items.length > 0) {
            nextItems = [...currentDraft.items];
        }
        else if (Array.isArray(currentDraft.sessions) &&
            currentDraft.sessions.length > 0) {
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
        nextItems = (0, exports.upsertProposalItem)(nextItems, item);
    }
    if (nextItems.length === 0)
        return currentDraft;
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
exports.mergeProposalDraftFromTool = mergeProposalDraftFromTool;
