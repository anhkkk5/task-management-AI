"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiChatService = void 0;
const mongoose_1 = require("mongoose");
const ai_provider_1 = require("./ai.provider");
const ai_repository_1 = require("./ai.repository");
const ai_mapper_1 = require("./ai.mapper");
const ai_intent_1 = require("./ai-intent");
const ai_context_1 = require("./ai-context");
const user_memory_service_1 = require("./user-memory.service");
/**
 * Resolve which conversation doc to use:
 *  1. Explicit conversationId (must belong to user).
 *  2. parentTaskId → find-or-create (so all subtasks of same parent share ONE thread).
 *  3. Create a brand-new standalone conversation.
 */
async function resolveConversation(userObjectId, input) {
    if (input.conversationId) {
        if (!mongoose_1.Types.ObjectId.isValid(input.conversationId)) {
            throw new Error("CONVERSATION_ID_INVALID");
        }
        const id = new mongoose_1.Types.ObjectId(input.conversationId);
        const existing = await ai_repository_1.aiRepository.findConversationByIdForUser({
            conversationId: id,
            userId: userObjectId,
        });
        if (!existing)
            throw new Error("CONVERSATION_FORBIDDEN");
        return { id, created: false, lastSubtaskKey: existing.lastSubtaskKey };
    }
    if (input.parentTaskId) {
        if (!mongoose_1.Types.ObjectId.isValid(input.parentTaskId)) {
            throw new Error("PARENT_TASK_ID_INVALID");
        }
        const parentTaskObjectId = new mongoose_1.Types.ObjectId(input.parentTaskId);
        const title = input.subtaskContext?.parentTaskTitle?.slice(0, 80) ||
            input.message.slice(0, 60);
        const domain = (0, ai_context_1.detectDomainFromTask)({
            parentTaskTitle: input.subtaskContext?.parentTaskTitle,
            parentTaskDescription: input.subtaskContext?.parentTaskDescription,
            subtaskTitle: input.subtaskContext?.subtaskTitle,
            subtaskDescription: input.subtaskContext?.description,
        });
        const { doc } = await ai_repository_1.aiRepository.findOrCreateConversationForParentTask({
            userId: userObjectId,
            parentTaskId: parentTaskObjectId,
            title,
            domain,
        });
        return { id: doc._id, created: false, lastSubtaskKey: doc.lastSubtaskKey };
    }
    const created = await ai_repository_1.aiRepository.createConversation({
        userId: userObjectId,
        title: input.message.slice(0, 60),
    });
    return { id: created._id, created: true };
}
exports.aiChatService = {
    chat: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const { id: conversationObjectId, lastSubtaskKey, } = await resolveConversation(userObjectId, input);
        // ── Load conversation history (for context + discussed subtasks)
        const historyMessages = await ai_repository_1.aiRepository.listMessagesByConversation({
            conversationId: conversationObjectId,
            userId: userObjectId,
            limit: 40,
        });
        // ── Detect subtask transition inside the SAME parent conversation
        const currentSubtaskKey = input.subtaskContext?.subtaskKey;
        const isSubtaskTransition = !!currentSubtaskKey &&
            !!lastSubtaskKey &&
            currentSubtaskKey !== lastSubtaskKey;
        if (isSubtaskTransition && input.subtaskContext?.subtaskTitle) {
            // Record transition note so the model knows focus changed.
            // Stored as 'system' role with meta.kind='transition' — not sent to
            // the model as a regular user turn, but summarized via discussedSubtasks.
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
        // ── Save user message with subtask meta (for future discussedSubtasks derivation)
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
        // ── Build smart system prompt
        const intent = (0, ai_intent_1.detectIntent)(input.message);
        const userLang = (0, ai_intent_1.detectUserLanguage)(input.message);
        const targetLang = (0, ai_intent_1.resolveTargetLanguage)(input.subtaskContext);
        const domain = (0, ai_context_1.detectDomainFromTask)({
            parentTaskTitle: input.subtaskContext?.parentTaskTitle,
            parentTaskDescription: input.subtaskContext?.parentTaskDescription,
            subtaskTitle: input.subtaskContext?.subtaskTitle,
            subtaskDescription: input.subtaskContext?.description,
        });
        const memories = await user_memory_service_1.userMemoryService.loadRelevantMemories(userObjectId, domain, 20);
        // Reload history including the transition + user just inserted so the
        // prompt sees the complete picture. Keep the call cheap by limiting.
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
        // Chat-style history sent to LLM: skip 'system' meta (transition) entries,
        // keep only user/assistant turns so provider APIs accept them.
        const historyForAI = historyMessages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
        }));
        const fewShot = historyForAI.length === 0 && input.fewShotMessages?.length
            ? input.fewShotMessages.map((m) => ({
                role: m.role,
                content: m.content,
            }))
            : [];
        const result = await ai_provider_1.aiProvider.chat({
            purpose: "chat",
            messages: [
                { role: "system", content: systemContent },
                ...fewShot,
                ...historyForAI,
                { role: "user", content: input.message },
            ],
            model: input.model,
            temperature: intent === "EXERCISE" || intent === "CHECK_ANSWER" ? 0.2 : 0.4,
            maxTokens: input.maxTokens,
        });
        await ai_repository_1.aiRepository.createMessage({
            conversationId: conversationObjectId,
            userId: userObjectId,
            role: "assistant",
            content: result.content,
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
        // Update conversation's lastSubtaskKey + domain
        await ai_repository_1.aiRepository.updateConversationContext({
            conversationId: conversationObjectId,
            userId: userObjectId,
            lastSubtaskKey: currentSubtaskKey,
            domain,
        });
        // Fire-and-forget memory extraction from the user utterance
        void user_memory_service_1.userMemoryService.ingestUtterance(userObjectId, input.message);
        return {
            reply: result.content,
            conversationId: String(conversationObjectId),
            model: result.model,
            usage: result.usage,
        };
    },
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
            messages: messages.map(ai_mapper_1.toPublicMessage),
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
            messages: messages.map(ai_mapper_1.toPublicMessage),
            created,
        };
    },
};
