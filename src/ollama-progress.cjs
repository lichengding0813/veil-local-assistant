function characterCount(value) {
  return typeof value === 'string' ? Array.from(value).length : 0;
}

function finiteNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function analyzeStreamPacket(packet) {
  const thinking = typeof packet?.message?.thinking === 'string'
    ? packet.message.thinking
    : '';
  const content = typeof packet?.message?.content === 'string'
    ? packet.message.content
    : '';

  let metrics = null;
  if (packet?.done) {
    const evalCount = finiteNumber(packet.eval_count);
    const evalDuration = finiteNumber(packet.eval_duration);
    metrics = {
      evalCount,
      evalDuration,
      promptEvalCount: finiteNumber(packet.prompt_eval_count),
      promptEvalDuration: finiteNumber(packet.prompt_eval_duration),
      loadDuration: finiteNumber(packet.load_duration),
      totalDuration: finiteNumber(packet.total_duration),
      tokensPerSecond: evalCount > 0 && evalDuration > 0
        ? evalCount / (evalDuration / 1e9)
        : 0
    };
  }

  return {
    thinkingCharacters: characterCount(thinking),
    content,
    contentCharacters: characterCount(content),
    metrics
  };
}

module.exports = { analyzeStreamPacket, characterCount };
