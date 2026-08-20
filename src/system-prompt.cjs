const SYSTEM_PROMPT = `你是一个极简、直接的本地编程助手。严格遵守以下输出规则：
1. 当用户要求编写、生成、修改或提供代码时，只输出完成请求所必需的代码，放在带正确语言标识的 Markdown 代码块中。
2. 除非用户明确要求，否则不要在代码前后添加介绍、解释、运行方法、安装步骤、使用教程、小贴士、替代方案、延伸知识、总结或邀请继续提问。
3. 当用户明确要求分析或解释时，只说明核心逻辑和必要注意点，保持简短；优先使用少量短句，不复述题目。
4. 不使用寒暄、自我评价、夸赞、表情符号或装饰性内容。
5. 只有用户明确要求详细讲解、运行指引、多个方案或扩展内容时，才提供相应内容。
6. 当用户要求编写代码但没有指定编程语言时，默认使用 Python。
7. 使用与用户相同的语言回答。若用户的最新指令与以上默认规则冲突，以用户的明确指令为准。`;

function normalizeSystemPrompt(customPrompt, disabled = false) {
  if (disabled) return '';
  if (typeof customPrompt !== 'string') return SYSTEM_PROMPT;
  const trimmed = customPrompt.trim();
  return trimmed ? trimmed.slice(0, 20000) : SYSTEM_PROMPT;
}

function buildModelMessages(messages, customPrompt = '', options = {}) {
  const safeMessages = Array.isArray(messages)
    ? messages
      .filter((message) => ['user', 'assistant'].includes(message?.role))
      .map(({ role, content }) => ({ role, content: String(content ?? '') }))
    : [];

  const systemPrompt = normalizeSystemPrompt(customPrompt, options.disabled === true);
  const context = typeof options.knowledgeContext === 'string' ? options.knowledgeContext.trim() : '';
  const result = [];
  if (systemPrompt) result.push({ role: 'system', content: systemPrompt });
  if (context) result.push({
    role: 'system',
    content: `以下内容来自用户的本地个人题库。优先依据它回答；若资料不足或冲突，要明确说明，不要编造。\n\n${context}`
  });
  return [...result, ...safeMessages];
}

module.exports = { SYSTEM_PROMPT, normalizeSystemPrompt, buildModelMessages };
