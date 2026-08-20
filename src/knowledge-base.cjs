const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function sqlText(value) {
  return `'${String(value ?? '').replace(/\0/g, '').replace(/'/g, "''")}'`;
}

async function runSql(databasePath, sql, json = false) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const args = json ? ['-json', databasePath, sql] : [databasePath, sql];
  const { stdout } = await execFileAsync('/usr/bin/sqlite3', args, { maxBuffer: 32 * 1024 * 1024 });
  if (!json || !stdout.trim()) return [];
  return JSON.parse(stdout);
}

async function initialize(databasePath) {
  await runSql(databasePath, `
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      explanation TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      embedding TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      item_id UNINDEXED, title, question, options, answer, explanation, subject,
      tokenize='unicode61'
    );
  `);
}

function normalizedOptions(options) {
  if (Array.isArray(options)) return options.map((item) => String(item)).join('\n');
  if (options && typeof options === 'object') {
    return Object.entries(options).map(([key, value]) => `${key}. ${value}`).join('\n');
  }
  return String(options ?? '');
}

function normalizeItem(raw, index, source) {
  if (typeof raw === 'string') raw = { question: raw };
  const question = String(raw?.question ?? raw?.题目 ?? raw?.content ?? raw?.内容 ?? raw?.title ?? '').trim();
  if (!question) return null;
  const stableId = crypto.createHash('sha256')
    .update(`${source || ''}\0${question}\0${String(raw?.answer ?? raw?.答案 ?? '')}`)
    .digest('hex')
    .slice(0, 32);
  return {
    id: String(raw?.id || stableId),
    title: String(raw?.title ?? raw?.标题 ?? `题目 ${index + 1}`).trim(),
    question,
    options: normalizedOptions(raw?.options ?? raw?.选项),
    answer: String(raw?.answer ?? raw?.答案 ?? '').trim(),
    explanation: String(raw?.explanation ?? raw?.解析 ?? '').trim(),
    subject: String(raw?.subject ?? raw?.科目 ?? '').trim(),
    difficulty: String(raw?.difficulty ?? raw?.难度 ?? '').trim(),
    source: String(raw?.source ?? source ?? '').trim()
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.filter((entry) => entry.some((value) => value.trim())).map((entry) => Object.fromEntries(
    headers.map((header, index) => [header, entry[index] ?? ''])
  ));
}

function parseKnowledgeFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const extension = path.extname(filePath).toLowerCase();
  let rawItems;
  if (extension === '.json') {
    const parsed = JSON.parse(text);
    rawItems = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.items || parsed.data || [parsed]);
  } else if (extension === '.jsonl' || extension === '.ndjson') {
    rawItems = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  } else if (extension === '.csv') rawItems = parseCsv(text);
  else rawItems = text.split(/\r?\n\s*\r?\n/).filter((block) => block.trim()).map((question) => ({ question }));

  return rawItems
    .map((item, index) => normalizeItem(item, index, path.basename(filePath)))
    .filter(Boolean);
}

function embeddingText(item) {
  return [item.title, item.question, item.options, item.answer, item.explanation, item.subject]
    .filter(Boolean)
    .join('\n');
}

async function importItems(databasePath, items, embedBatch, onProgress = () => {}) {
  await initialize(databasePath);
  let imported = 0;
  const batchSize = 12;
  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize);
    onProgress({ phase: 'embedding', completed: offset, total: items.length });
    const embeddings = await embedBatch(batch.map(embeddingText));
    const now = Date.now();
    const statements = ['BEGIN IMMEDIATE;'];
    batch.forEach((item, index) => {
      const embedding = Array.isArray(embeddings[index]) ? JSON.stringify(embeddings[index]) : '';
      statements.push(`
        DELETE FROM knowledge_fts WHERE item_id=${sqlText(item.id)};
        INSERT INTO knowledge_items
          (id,title,question,options,answer,explanation,subject,difficulty,source,embedding,created_at,updated_at)
        VALUES
          (${sqlText(item.id)},${sqlText(item.title)},${sqlText(item.question)},${sqlText(item.options)},${sqlText(item.answer)},${sqlText(item.explanation)},${sqlText(item.subject)},${sqlText(item.difficulty)},${sqlText(item.source)},${sqlText(embedding)},${now},${now})
        ON CONFLICT(id) DO UPDATE SET
          title=excluded.title,question=excluded.question,options=excluded.options,answer=excluded.answer,
          explanation=excluded.explanation,subject=excluded.subject,difficulty=excluded.difficulty,
          source=excluded.source,embedding=excluded.embedding,updated_at=excluded.updated_at;
        INSERT INTO knowledge_fts (item_id,title,question,options,answer,explanation,subject)
        VALUES (${sqlText(item.id)},${sqlText(item.title)},${sqlText(item.question)},${sqlText(item.options)},${sqlText(item.answer)},${sqlText(item.explanation)},${sqlText(item.subject)});
      `);
    });
    statements.push('COMMIT;');
    await runSql(databasePath, statements.join('\n'));
    imported += batch.length;
    onProgress({ phase: 'saving', completed: imported, total: items.length });
  }
  return imported;
}

async function status(databasePath) {
  await initialize(databasePath);
  const rows = await runSql(databasePath, `
    SELECT COUNT(*) AS count,
      SUM(CASE WHEN embedding <> '' THEN 1 ELSE 0 END) AS embedded,
      MAX(updated_at) AS updatedAt
    FROM knowledge_items;
  `, true);
  return {
    count: Number(rows[0]?.count || 0),
    embedded: Number(rows[0]?.embedded || 0),
    updatedAt: Number(rows[0]?.updatedAt || 0)
  };
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm) || 1);
}

function ftsExpression(query) {
  const terms = String(query).match(/[\p{L}\p{N}_+-]{2,}/gu) || [];
  return [...new Set(terms.slice(0, 12))]
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' OR ');
}

async function retrieve(databasePath, query, queryEmbedding, limit = 5) {
  await initialize(databasePath);
  const fields = 'id,title,question,options,answer,explanation,subject,difficulty,source,embedding';
  const fts = ftsExpression(query);
  const keywordRows = fts
    ? await runSql(databasePath, `
        SELECT k.${fields.split(',').join(',k.')}, bm25(knowledge_fts) AS keywordScore
        FROM knowledge_fts JOIN knowledge_items k ON k.id=knowledge_fts.item_id
        WHERE knowledge_fts MATCH ${sqlText(fts)} ORDER BY keywordScore LIMIT 30;
      `, true)
    : [];
  const vectorRows = await runSql(databasePath, `SELECT ${fields} FROM knowledge_items WHERE embedding <> '';`, true);
  const semanticRows = vectorRows.map((row) => {
    let embedding = [];
    try { embedding = JSON.parse(row.embedding); } catch { /* ignore invalid legacy vectors */ }
    return { ...row, semanticScore: cosineSimilarity(queryEmbedding, embedding) };
  }).filter((row) => row.semanticScore > -1).sort((a, b) => b.semanticScore - a.semanticScore).slice(0, 30);

  const combined = new Map();
  keywordRows.forEach((row, index) => combined.set(row.id, {
    ...row,
    score: (combined.get(row.id)?.score || 0) + 1 / (60 + index + 1),
    keywordRank: index + 1
  }));
  semanticRows.forEach((row, index) => combined.set(row.id, {
    ...(combined.get(row.id) || row),
    semanticScore: row.semanticScore,
    score: (combined.get(row.id)?.score || 0) + 1 / (60 + index + 1),
    semanticRank: index + 1
  }));
  return [...combined.values()]
    .sort((left, right) => right.score - left.score || (right.semanticScore || 0) - (left.semanticScore || 0))
    .slice(0, Math.max(1, Math.min(Number(limit) || 5, 10)))
    .map(({ embedding, ...row }) => row);
}

async function clear(databasePath) {
  await initialize(databasePath);
  await runSql(databasePath, 'BEGIN; DELETE FROM knowledge_items; DELETE FROM knowledge_fts; COMMIT;');
}

module.exports = {
  clear,
  cosineSimilarity,
  importItems,
  initialize,
  normalizeItem,
  parseKnowledgeFile,
  retrieve,
  status
};
