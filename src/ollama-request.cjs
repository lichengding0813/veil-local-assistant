function buildChatRequest({ model, messages, think }) {
  return {
    model,
    messages,
    stream: true,
    think: think === true
  };
}

module.exports = { buildChatRequest };
