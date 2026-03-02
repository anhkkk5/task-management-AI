"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiPromptService = void 0;
exports.aiPromptService = {
    buildChatPrompt: (input) => {
        return [
            "You are a productivity assistant.",
            "Reply in Vietnamese.",
            "User message:",
            input.message,
        ].join("\n");
    },
    buildTaskBreakdownPrompt: (input) => {
        return [
            "You are a productivity assistant.",
            "Break this task into actionable steps.",
            `Task: ${input.title}`,
            `Deadline: ${input.deadline ? input.deadline.toISOString() : ""}`,
            `User skill: ${input.skillLevel ?? ""}`,
        ].join("\n");
    },
    buildPrioritySuggestPrompt: (input) => {
        return [
            "You are a productivity assistant.",
            "Suggest priority for the task as one of: low, medium, high, urgent.",
            `Task: ${input.title}`,
            `Deadline: ${input.deadline ? input.deadline.toISOString() : ""}`,
            "Return JSON with fields: priority, reason.",
        ].join("\n");
    },
    buildSchedulePlanPrompt: (input) => {
        return [
            "You are a productivity assistant.",
            "Create a day-by-day learning plan.",
            `Goal: ${input.goal}`,
            `Days: ${input.days ?? ""}`,
        ].join("\n");
    },
};
