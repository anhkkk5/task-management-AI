export const aiPromptService = {
  buildChatPrompt: (input: { message: string }): string => {
    return [
      "You are a productivity assistant.",
      "Reply in Vietnamese.",
      "User message:",
      input.message,
    ].join("\n");
  },

  buildTaskBreakdownPrompt: (input: {
    title: string;
    deadline?: Date;
    skillLevel?: string;
  }): string => {
    return [
      "You are a productivity assistant.",
      "Break this task into actionable steps.",
      `Task: ${input.title}`,
      `Deadline: ${input.deadline ? input.deadline.toISOString() : ""}`,
      `User skill: ${input.skillLevel ?? ""}`,
    ].join("\n");
  },

  buildPrioritySuggestPrompt: (input: {
    title: string;
    deadline?: Date;
  }): string => {
    return [
      "You are a productivity assistant.",
      "Suggest priority for the task as one of: low, medium, high, urgent.",
      `Task: ${input.title}`,
      `Deadline: ${input.deadline ? input.deadline.toISOString() : ""}`,
      "Return JSON with fields: priority, reason.",
    ].join("\n");
  },

  buildSchedulePlanPrompt: (input: { goal: string; days?: number }): string => {
    return [
      "You are a productivity assistant.",
      "Create a day-by-day learning plan.",
      `Goal: ${input.goal}`,
      `Days: ${input.days ?? ""}`,
    ].join("\n");
  },
};
