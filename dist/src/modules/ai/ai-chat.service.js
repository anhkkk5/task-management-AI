"use strict";
/**
 * ai-chat.service.ts
 * -------------------
 * Thin orchestrator for the AI chat feature. Heavy logic has been extracted:
 *   - ai-chat-helpers.ts  → types, pure functions, debug logging
 *   - ai-chat-draft.ts    → proposal-draft merging
 *   - ai-chat-calendar.ts → fast-path, model tool-loop, forced-commit
 *
 * This file wires together context loading, intent detection, prompt
 * building, and delegates to the appropriate handler.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiChatService = void 0;
const mongoose_1 = require("mongoose");
const ai_provider_1 = require("./ai.provider");
const ai_repository_1 = require("./ai.repository");
const ai_mapper_1 = require("./ai.mapper");
const ai_intent_1 = require("./ai-intent");
const ai_context_1 = require("./ai-context");
const user_memory_service_1 = require("./user-memory.service");
const ai_chat_helpers_1 = require("./ai-chat-helpers");
const ai_chat_calendar_1 = require("./ai-chat-calendar");
exports.aiChatService = {
    /**
     * Main non-streaming chat endpoint.
     * Detects intent → builds prompt → delegates to calendar handler or plain LLM.
     */
    chat: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const { id: conversationObjectId, lastSubtaskKey } = await (0, ai_chat_helpers_1.resolveConversation)(userObjectId, input);
        // ── Load conversation history ────────────────────────────────────
        const historyMessages = await ai_repository_1.aiRepository.listMessagesByConversation({
            conversationId: conversationObjectId,
            userId: userObjectId,
            limit: 40,
        });
        // ── Detect subtask transition ────────────────────────────────────
        const currentSubtaskKey = input.subtaskContext?.subtaskKey;
        const isSubtaskTransition = !!currentSubtaskKey &&
            !!lastSubtaskKey &&
            currentSubtaskKey !== lastSubtaskKey;
        if (isSubtaskTransition && input.subtaskContext?.subtaskTitle) {
            await ai_repository_1.aiRepository.createMessage({
                conversationId: conversationObjectId,
                userId: userObjectId,
                role: "system",
                content: `[TRANSITION] Người dùng chuyển sang nhiệm vụ: "${input.subtaskContext.subtaskTitle}"`,
                meta: {
                    kind: "transition",
                    subtaskKey: currentSubtaskKey,
                    subtaskTitle: input.subtaskContext.subtaskTitle,
                    subtaskIndex: input.subtaskContext.subtaskIndex,
                },
            });
        }
        // ── Save user message ────────────────────────────────────────────
        await ai_repository_1.aiRepository.createMessage({
            conversationId: conversationObjectId,
            userId: userObjectId,
            role: "user",
            content: input.message,
            meta: currentSubtaskKey
                ? {
                    kind: "chat",
                    subtaskKey: currentSubtaskKey,
                    subtaskTitle: input.subtaskContext?.subtaskTitle,
                    subtaskIndex: input.subtaskContext?.subtaskIndex,
                }
                : undefined,
        });
        // ── Intent detection + override for pending draft ────────────────
        let intent = (0, ai_intent_1.detectIntent)(input.message);
        const userLang = (0, ai_intent_1.detectUserLanguage)(input.message);
        const targetLang = (0, ai_intent_1.resolveTargetLanguage)(input.subtaskContext);
        if (intent !== "CALENDAR_QUERY" &&
            (0, ai_chat_helpers_1.isCommitConfirmationMessage)(input.message)) {
            try {
                const convDoc = await ai_repository_1.aiRepository.findConversationByIdForUser({
                    conversationId: conversationObjectId,
                    userId: userObjectId,
                });
                const pendingDraft = convDoc?.context?.proposalDraft;
                const hasPendingDraft = !!pendingDraft &&
                    (Array.isArray(pendingDraft.items)
                        ? pendingDraft.items.length > 0
                        : Array.isArray(pendingDraft.sessions) &&
                            pendingDraft.sessions.length > 0);
                if (hasPendingDraft) {
                    (0, ai_chat_helpers_1.logScheduleDebug)("chat.intent.override_to_calendar", {
                        user: (0, ai_chat_helpers_1.shortUser)(userId),
                        conversationId: String(conversationObjectId),
                        originalIntent: intent,
                        reason: "commit_confirmation_with_pending_draft",
                    });
                    intent = "CALENDAR_QUERY";
                }
            }
            catch (err) {
                (0, ai_chat_helpers_1.logScheduleDebug)("chat.intent.override_check_error", {
                    user: (0, ai_chat_helpers_1.shortUser)(userId),
                    message: err instanceof Error ? err.message : String(err),
                });
            }
        }
        // ── Build system prompt ──────────────────────────────────────────
        const domain = (0, ai_context_1.detectDomainFromTask)({
            parentTaskTitle: input.subtaskContext?.parentTaskTitle,
            parentTaskDescription: input.subtaskContext?.parentTaskDescription,
            subtaskTitle: input.subtaskContext?.subtaskTitle,
            subtaskDescription: input.subtaskContext?.description,
        });
        const memories = await user_memory_service_1.userMemoryService.loadRelevantMemories(userObjectId, domain, 20);
        const freshHistory = await ai_repository_1.aiRepository.listMessagesByConversation({
            conversationId: conversationObjectId,
            userId: userObjectId,
            limit: 40,
        });
        const discussedSubtasks = (0, ai_context_1.buildDiscussedSubtasks)(freshHistory);
        const pendingSlots = (0, ai_context_1.computePendingSlots)({
            domain,
            memories,
            history: freshHistory,
        });
        const systemContent = (0, ai_intent_1.buildSystemPrompt)({
            userLang,
            targetLang,
            intent,
            subtaskContext: input.subtaskContext,
            customSystemPrompt: input.systemPrompt,
            memoryHints: (0, ai_context_1.toMemoryHints)(memories),
            discussedSubtasks,
            pendingSlots,
        });
        // ── Prepare LLM messages ─────────────────────────────────────────
        const HISTORY_TURN_CAP = 12;
        const PER_MSG_CHAR_CAP = 1500;
        const historyForAI = historyMessages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .slice(-HISTORY_TURN_CAP)
            .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content.length > PER_MSG_CHAR_CAP
                ? `${m.content.slice(0, PER_MSG_CHAR_CAP)}…`
                : m.content,
        }));
        const fewShot = historyForAI.length === 0 && input.fewShotMessages?.length
            ? input.fewShotMessages.map((m) => ({
                role: m.role,
                content: m.content,
            }))
            : [];
        const baseMessages = [
            { role: "system", content: systemContent },
            ...fewShot.map((m) => ({ role: m.role, content: m.content })),
            ...historyForAI.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: input.message },
        ];
        // ── Dispatch to handler ──────────────────────────────────────────
        let result = {
            content: ai_chat_helpers_1.FALLBACK_ASSISTANT_REPLY,
            model: undefined,
            usage: undefined,
        };
        let tasksCreatedCount = 0;
        if (intent === "CALENDAR_QUERY") {
            const calResult = await (0, ai_chat_calendar_1.handleCalendarIntent)({
                userId,
                userObjectId,
                conversationObjectId,
                domain,
                currentSubtaskKey,
                input,
                baseMessages,
                historyForAILength: historyForAI.length,
            });
            result = {
                content: calResult.content,
                model: calResult.model,
                usage: calResult.usage,
            };
            tasksCreatedCount = calResult.tasksCreatedCount;
        }
        else {
            result = await ai_provider_1.aiProvider.chat({
                purpose: "chat",
                messages: baseMessages,
                model: input.model,
                temperature: intent === "EXERCISE" || intent === "CHECK_ANSWER" ? 0.2 : 0.4,
                maxTokens: input.maxTokens,
            });
        }
        // ── Persist assistant reply ──────────────────────────────────────
        const finalAssistantContent = (0, ai_chat_helpers_1.ensureAssistantContent)(result.content);
        await ai_repository_1.aiRepository.createMessage({
            conversationId: conversationObjectId,
            userId: userObjectId,
            role: "assistant",
            content: finalAssistantContent,
            tokens: result.usage?.totalTokens,
            meta: currentSubtaskKey
                ? {
                    kind: "chat",
                    subtaskKey: currentSubtaskKey,
                    subtaskTitle: input.subtaskContext?.subtaskTitle,
                    subtaskIndex: input.subtaskContext?.subtaskIndex,
                }
                : undefined,
        });
        await ai_repository_1.aiRepository.touchConversationUpdatedAt({
            conversationId: conversationObjectId,
            userId: userObjectId,
        });
        await ai_repository_1.aiRepository.updateConversationContext({
            conversationId: conversationObjectId,
            userId: userObjectId,
            lastSubtaskKey: currentSubtaskKey,
            domain,
        });
        void user_memory_service_1.userMemoryService.ingestUtterance(userObjectId, input.message);
        return {
            reply: finalAssistantContent,
            conversationId: String(conversationObjectId),
            model: result.model,
            usage: result.usage,
            ...(tasksCreatedCount > 0 ? { tasksCreated: tasksCreatedCount } : {}),
        };
    },
    /**
     * Streaming chat endpoint (simplified — no tool calling).
     */
    chatStream: async function* (userId, input) {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const title = input.message.slice(0, 60);
        if (input.conversationId && !mongoose_1.Types.ObjectId.isValid(input.conversationId)) {
            throw new Error("CONVERSATION_ID_INVALID");
        }
        const conversationObjectId = input.conversationId
            ? new mongoose_1.Types.ObjectId(input.conversationId)
            : (await ai_repository_1.aiRepository.createConversation({
                userId: userObjectId,
                title,
            }))._id;
        if (input.conversationId) {
            const existing = await ai_repository_1.aiRepository.findConversationByIdForUser({
                conversationId: conversationObjectId,
                userId: userObjectId,
            });
            if (!existing) {
                throw new Error("CONVERSATION_FORBIDDEN");
            }
        }
        await ai_repository_1.aiRepository.createMessage({
            conversationId: conversationObjectId,
            userId: userObjectId,
            role: "user",
            content: input.message,
        });
        yield { type: "meta", conversationId: String(conversationObjectId) };
        const stream = ai_provider_1.aiProvider.chatStream({
            purpose: "chat",
            messages: [
                {
                    role: "system",
                    content: "Bạn là trợ lý AI cho ứng dụng quản lý công việc. Luôn trả lời ngắn gọn, bám đúng câu hỏi, đề xuất bước hành động cụ thể khi phù hợp. Không bịa thông tin, không tự mở rộng ngoài phạm vi câu hỏi. Trả lời bằng tiếng Việt trừ khi người dùng viết bằng ngôn ngữ khác.",
                },
                { role: "user", content: input.message },
            ],
            model: input.model,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
        });
        let assistantText = "";
        let finalUsage;
        for await (const ev of stream) {
            if (ev.type === "meta") {
                yield ev;
                continue;
            }
            if (ev.type === "delta") {
                assistantText += ev.delta;
                yield ev;
                continue;
            }
            finalUsage = ev.usage;
            yield ev;
        }
        if (assistantText) {
            await ai_repository_1.aiRepository.createMessage({
                conversationId: conversationObjectId,
                userId: userObjectId,
                role: "assistant",
                content: assistantText,
                tokens: finalUsage?.totalTokens,
            });
        }
        await ai_repository_1.aiRepository.touchConversationUpdatedAt({
            conversationId: conversationObjectId,
            userId: userObjectId,
        });
    },
    listConversations: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
        const items = await ai_repository_1.aiRepository.listConversationsByUser({
            userId: userObjectId,
            limit,
        });
        return { conversations: items.map(ai_mapper_1.toPublicConversation) };
    },
    getConversationById: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        if (!mongoose_1.Types.ObjectId.isValid(input.id)) {
            throw new Error("CONVERSATION_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const conversationObjectId = new mongoose_1.Types.ObjectId(input.id);
        const conversation = await ai_repository_1.aiRepository.findConversationByIdForUser({
            conversationId: conversationObjectId,
            userId: userObjectId,
        });
        if (!conversation) {
            throw new Error("CONVERSATION_FORBIDDEN");
        }
        const limit = Math.min(Math.max(input.limitMessages ?? 100, 1), 500);
        const messages = await ai_repository_1.aiRepository.listMessagesByConversation({
            conversationId: conversationObjectId,
            userId: userObjectId,
            limit,
        });
        return {
            conversation: (0, ai_mapper_1.toPublicConversation)(conversation),
            messages: messages
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map(ai_mapper_1.toPublicMessage),
        };
    },
    getOrCreateConversationByParentTask: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId))
            throw new Error("USER_ID_INVALID");
        if (!mongoose_1.Types.ObjectId.isValid(input.parentTaskId))
            throw new Error("PARENT_TASK_ID_INVALID");
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const parentTaskObjectId = new mongoose_1.Types.ObjectId(input.parentTaskId);
        const { doc, created } = await ai_repository_1.aiRepository.findOrCreateConversationForParentTask({
            userId: userObjectId,
            parentTaskId: parentTaskObjectId,
            title: (input.title || "").slice(0, 80) || "Task conversation",
        });
        const messages = await ai_repository_1.aiRepository.listMessagesByConversation({
            conversationId: doc._id,
            userId: userObjectId,
            limit: 100,
        });
        return {
            conversation: (0, ai_mapper_1.toPublicConversation)(doc),
            messages: messages
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map(ai_mapper_1.toPublicMessage),
            created,
        };
    },
};
