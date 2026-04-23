/**
 * AI 办公助理 · 后端代理服务
 * 完整 RAG 版本：Chunking + TF-IDF Embedding + MiniMax API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const RAGEngine = require('./rag-engine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== MiniMax API 配置 =====
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';
const MINIMAX_MODEL = 'MiniMax-M2';

// ===== 初始化 RAG 引擎 =====
const rag = new RAGEngine();

// 加载 knowledge 文件夹下的所有 .md 和 .txt 文件
const knowledgeDir = path.join(__dirname, 'knowledge');
if (fs.existsSync(knowledgeDir)) {
  const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  files.forEach(file => {
    rag.loadAndIndex(path.join(knowledgeDir, file));
  });
} else {
  // 如果没有 knowledge 文件夹，尝试加载根目录的 employee-handbook.md
  const handbookPath = path.join(__dirname, 'employee-handbook.md');
  if (fs.existsSync(handbookPath)) {
    rag.loadAndIndex(handbookPath);
  } else {
    console.warn('⚠️ 未找到知识库文件，将以无 RAG 模式运行');
    console.warn('   请将 .md 或 .txt 文件放入 knowledge/ 文件夹，或将 employee-handbook.md 放在项目根目录');
  }
}

// ===== 构建 System Prompt =====
function buildSystemPrompt(userQuery) {
  const basePrompt = `你是一名专业的 AI 办公助理，名叫"小智"。你擅长将碎片化的工作信息整理为结构清晰、表达专业的文档。你的语气专业、友好、简洁。

【能力范围】
1. 周报/日报整理：将散乱的工作记录整理为格式规范的周报
2. 会议纪要生成：从会议记录中提取关键信息，生成结构化纪要
3. 待办事项提取：从对话或文档中识别任务、责任人和截止日期
4. 邮件/消息撰写：根据简要描述生成专业的工作沟通文案
5. 文案润色：优化表达，使文字更专业简洁
6. 公司政策咨询：基于公司知识库回答考勤、请假、薪酬、福利等问题

【输出要求】
- 回复语言与用户输入保持一致
- 使用结构化格式（标题、列表、分段）让信息一目了然
- 每条事项以动词开头（完成、推进、对齐、输出）
- 信息不足时注明"信息不足，请补充"，绝不编造内容
- 控制回复长度，简洁专业，避免冗余套话

【边界规则】
- 仅处理办公相关任务，超出范围时礼貌拒绝
- 不提供医疗、法律、金融等专业建议
- 回答公司政策问题时，严格基于【参考资料】中的内容，不要编造
- 如果参考资料中没有相关信息，如实说"这个问题我需要进一步确认，建议联系HR"`;

  // RAG 检索
  const { context, results } = rag.getContext(userQuery);

  if (context) {
    console.log(`📚 RAG 检索命中 ${results.length} 块：`);
    results.forEach(r => {
      console.log(`   - [${r.chunk.title}] 相似度 ${(r.score * 100).toFixed(1)}%`);
    });

    return basePrompt + `\n\n【参考资料 — 以下内容来自公司知识库，请基于这些信息回答】\n${context}`;
  }

  console.log('📚 RAG 未检索到相关内容');
  return basePrompt;
}

// ===== 带重试的 API 请求 =====
async function callMiniMaxWithRetry(messages, systemPrompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${new Date().toLocaleTimeString()}] 第 ${attempt} 次请求...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];

      const response = await fetch(MINIMAX_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MINIMAX_API_KEY}`
        },
        body: JSON.stringify({
          model: MINIMAX_MODEL,
          messages: apiMessages,
          max_tokens: 1000,
          temperature: 0.6
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      if (data.choices && data.choices.length > 0) {
        let reply = data.choices[0].message?.content || '';
        reply = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        if (reply) return reply;
      }

      throw new Error('API 返回空内容');

    } catch (err) {
      console.log(`[${new Date().toLocaleTimeString()}] 第 ${attempt} 次失败: ${err.message}`);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ===== API 路由 =====
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供 messages 数组' });
    }

    if (!MINIMAX_API_KEY) {
      return res.status(500).json({ error: 'API Key 未配置' });
    }

    // 取最后一条用户消息做 RAG 检索
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const systemPrompt = buildSystemPrompt(lastUserMsg?.content || '');

    const reply = await callMiniMaxWithRetry(messages, systemPrompt);
    console.log(`[${new Date().toLocaleTimeString()}] ✅ 回复成功，${reply.length} 字\n`);
    res.json({ reply });

  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ 最终失败:`, err.message);
    res.status(500).json({ error: '请求失败，请稍后重试', detail: err.message });
  }
});

// RAG 调试接口：可以直接测试检索效果
app.get('/api/search', (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: '请提供 q 参数' });

  const { context, results } = rag.getContext(query);
  res.json({
    query,
    matchCount: results.length,
    results: results.map(r => ({
      title: r.chunk.title,
      score: (r.score * 100).toFixed(1) + '%',
      preview: r.chunk.content.substring(0, 150) + '...'
    }))
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: MINIMAX_MODEL,
    apiKeyConfigured: !!MINIMAX_API_KEY,
    ragChunks: rag.chunks.length,
    ragVocabulary: Object.keys(rag.vocabulary).length
  });
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   🤖 AI 办公助理 · Smart Office Bot          ║
  ║   运行地址: http://localhost:${PORT}            ║
  ║   模型: ${MINIMAX_MODEL}                        ║
  ║   API Key: ${MINIMAX_API_KEY ? '✅ 已配置' : '❌ 未配置'}                          ║
  ║   RAG: ✅ ${rag.chunks.length} 个文本块 / ${Object.keys(rag.vocabulary).length} 词汇       ║
  ║   重试: ✅ 最多3次 / 30秒超时                ║
  ║                                              ║
  ║   调试: http://localhost:${PORT}/api/search?q=年假  ║
  ╚══════════════════════════════════════════════╝
  `);
});
