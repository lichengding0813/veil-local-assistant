(function () {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderInline(value) {
    const tokens = [];
    const stash = (html) => {
      const marker = `\u0000VEILTOKEN${tokens.length}\u0000`;
      tokens.push(html);
      return marker;
    };

    let source = String(value);
    source = source.replace(/`([^`\n]+)`/g, (_match, code) => stash(`<code>${escapeHtml(code)}</code>`));
    source = source.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
      let safeUrl;
      try {
        safeUrl = new URL(url);
        if (!['http:', 'https:'].includes(safeUrl.protocol)) return escapeHtml(label);
      } catch {
        return escapeHtml(label);
      }
      return stash(`<a href="${escapeHtml(safeUrl.toString())}" rel="noreferrer">${escapeHtml(label)}</a>`);
    });

    let html = escapeHtml(source);
    html = html
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

    tokens.forEach((token, index) => {
      html = html.replace(`\u0000VEILTOKEN${index}\u0000`, token);
    });
    return html;
  }

  function isSpecialLine(lines, index) {
    const line = lines[index] || '';
    const next = lines[index + 1] || '';
    return !line.trim()
      || /^```/.test(line)
      || /^#{1,6}\s+/.test(line)
      || /^>\s?/.test(line)
      || /^\s*[-*+]\s+/.test(line)
      || /^\s*\d+[.)]\s+/.test(line)
      || /^\s*(---+|___+|\*\*\*+)\s*$/.test(line)
      || (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(next));
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fence = line.match(/^```\s*([\w.+-]*)\s*$/);
      if (fence) {
        const language = fence[1] || 'text';
        const code = [];
        index += 1;
        while (index < lines.length && !/^```\s*$/.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        output.push(`<div class="code-block"><div class="code-header"><span>${escapeHtml(language)}</span><button type="button" class="copy-code">复制</button></div><pre><code>${escapeHtml(code.join('\n'))}</code></pre></div>`);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
        output.push('<hr>');
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quote = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          quote.push(lines[index].replace(/^>\s?/, ''));
          index += 1;
        }
        output.push(`<blockquote>${quote.map(renderInline).join('<br>')}</blockquote>`);
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
          index += 1;
        }
        output.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
          index += 1;
        }
        output.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
        continue;
      }

      if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || '')) {
        const splitRow = (row) => row.replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cell.trim());
        const headers = splitRow(line);
        index += 2;
        const rows = [];
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          rows.push(splitRow(lines[index]));
          index += 1;
        }
        output.push(`<div class="table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_header, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      const paragraph = [line];
      index += 1;
      while (index < lines.length && !isSpecialLine(lines, index)) {
        paragraph.push(lines[index]);
        index += 1;
      }
      output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    }

    return output.join('');
  }

  const api = { render: renderMarkdown, escapeHtml };
  if (typeof window !== 'undefined') window.MarkdownRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
