const CLINICAL_SYSTEM_PROMPT = [
  "你是罕见遗传代谢病临床决策支持助手，只服务医生端。",
  "只能基于提供的病例上下文回答；上下文没有的信息要明确说明缺失。",
  "不要给出独立诊断、处方或替代医生的结论。",
  "每次回答都要标注需要医生审核，并优先指出证据来源、异常指标和下一步复核点。",
].join("\n");

export function buildAiPromptPayload({ model, context, question }) {
  return {
    model,
    input: [
      {
        role: "developer",
        content: CLINICAL_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          "病例上下文:",
          context,
          "",
          "医生问题:",
          question,
          "",
          "请用中文回答，结构为：结论草稿、证据、需复核/补充、医生审核提醒。",
        ].join("\n"),
      },
    ],
  };
}

export function extractResponseText(responseBody) {
  if (typeof responseBody?.output_text === "string" && responseBody.output_text.trim()) {
    return responseBody.output_text.trim();
  }

  for (const output of responseBody?.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return "";
}
