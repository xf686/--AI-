/**
 * RAG 引擎：Chunking + Embedding（TF-IDF 向量化）
 * 
 * 流程：
 * 1. Chunking：按章节/段落把长文档切成小块
 * 2. Embedding：用 TF-IDF 把每块文本变成向量（一组数字）
 * 3. Search：用户提问时，把问题也变成向量，找最相似的几块
 */

const fs = require('fs');
const path = require('path');

class RAGEngine {
  constructor() {
    this.chunks = [];      // 切好的文本块
    this.vectors = [];     // 每块对应的向量
    this.vocabulary = {};  // 词汇表：每个词对应一个维度
    this.idf = {};         // 每个词的 IDF 值（逆文档频率）
  }

  // ===== 第一步：Chunking（切块）=====
  chunkDocument(text, options = {}) {
    const {
      chunkSize = 300,      // 每块大约多少字
      overlap = 50,          // 块之间重叠多少字（防止切断上下文）
    } = options;

    const chunks = [];
    
    // 策略1：先按章节标题切（## 或 ### 开头的行）
    const sections = text.split(/\n(?=##\s)/);
    
    for (const section of sections) {
      // 提取章节标题
      const titleMatch = section.match(/^(#{1,3})\s+(.+)/);
      const title = titleMatch ? titleMatch[2].trim() : '未分类';
      
      // 如果章节内容短于 chunkSize，直接作为一块
      const content = section.trim();
      if (content.length <= chunkSize) {
        if (content.length > 20) { // 忽略太短的块
          chunks.push({
            id: chunks.length,
            title: title,
            content: content,
            charCount: content.length
          });
        }
        continue;
      }

      // 章节内容太长，按段落继续切
      const paragraphs = content.split(/\n\n+/);
      let buffer = '';
      let bufferTitle = title;

      for (const para of paragraphs) {
        if ((buffer + '\n' + para).length > chunkSize && buffer.length > 20) {
          chunks.push({
            id: chunks.length,
            title: bufferTitle,
            content: buffer.trim(),
            charCount: buffer.trim().length
          });
          // 保留 overlap 部分作为下一块的开头
          const words = buffer.split('');
          buffer = words.slice(-overlap).join('') + '\n' + para;
        } else {
          buffer = buffer ? buffer + '\n' + para : para;
        }
      }

      // 处理剩余内容
      if (buffer.trim().length > 20) {
        chunks.push({
          id: chunks.length,
          title: bufferTitle,
          content: buffer.trim(),
          charCount: buffer.trim().length
        });
      }
    }

    this.chunks = chunks;
    console.log(`✂️  Chunking 完成：${chunks.length} 个文本块`);
    chunks.forEach((c, i) => {
      console.log(`   [${i}] ${c.title} (${c.charCount}字)`);
    });

    return chunks;
  }

  // ===== 第二步：Embedding（向量化）=====
  
  // 2a. 中文分词（简易版：按2-3字词组切分）
  tokenize(text) {
    // 移除标点和特殊字符
    const cleaned = text.replace(/[，。、；：！？\-\|\[\]（）()""''#*\n\r\t\s]+/g, ' ').trim();
    const tokens = [];
    
    // 生成 bigram（2字词组）和 trigram（3字词组）
    for (let i = 0; i < cleaned.length - 1; i++) {
      const char = cleaned[i];
      if (char === ' ') continue;
      
      // bigram
      if (i + 1 < cleaned.length && cleaned[i + 1] !== ' ') {
        tokens.push(cleaned.substring(i, i + 2));
      }
      // trigram
      if (i + 2 < cleaned.length && cleaned[i + 1] !== ' ' && cleaned[i + 2] !== ' ') {
        tokens.push(cleaned.substring(i, i + 3));
      }
    }

    // 也加入完整的中文词（通过空格分割的部分）
    cleaned.split(/\s+/).forEach(word => {
      if (word.length >= 2 && word.length <= 6) {
        tokens.push(word);
      }
    });

    return tokens;
  }

  // 2b. 构建词汇表和计算 IDF
  buildVocabulary() {
    const docFreq = {}; // 每个词出现在几个文本块中
    const totalDocs = this.chunks.length;

    // 统计每个词在多少个块中出现
    this.chunks.forEach(chunk => {
      const tokens = new Set(this.tokenize(chunk.content));
      tokens.forEach(token => {
        docFreq[token] = (docFreq[token] || 0) + 1;
      });
    });

    // 构建词汇表（给每个词分配一个维度编号）
    let dim = 0;
    for (const token of Object.keys(docFreq)) {
      // 过滤掉出现在几乎所有文档中的词（没有区分度）
      if (docFreq[token] < totalDocs * 0.9) {
        this.vocabulary[token] = dim++;
        // IDF = log(总文档数 / 包含该词的文档数)
        this.idf[token] = Math.log(totalDocs / docFreq[token]);
      }
    }

    console.log(`📖 词汇表构建完成：${Object.keys(this.vocabulary).length} 个词`);
  }

  // 2c. 把一段文本变成向量（TF-IDF）
  textToVector(text) {
    const tokens = this.tokenize(text);
    const tf = {}; // 词频

    // 计算 TF（词频）
    tokens.forEach(token => {
      tf[token] = (tf[token] || 0) + 1;
    });

    // 构建 TF-IDF 向量
    const vector = {};
    for (const [token, freq] of Object.entries(tf)) {
      if (this.vocabulary[token] !== undefined) {
        const dim = this.vocabulary[token];
        vector[dim] = freq * (this.idf[token] || 1);
      }
    }

    return vector;
  }

  // 2d. 对所有文本块做 Embedding
  embedAllChunks() {
    this.buildVocabulary();
    
    this.vectors = this.chunks.map(chunk => {
      return this.textToVector(chunk.content);
    });

    console.log(`🔢 Embedding 完成：${this.vectors.length} 个向量`);
  }

  // ===== 第三步：Search（语义检索）=====
  
  // 计算两个向量的余弦相似度
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    const allDims = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    
    allDims.forEach(dim => {
      const a = vecA[dim] || 0;
      const b = vecB[dim] || 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    });

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // 搜索最相关的文本块
  search(query, topK = 3) {
    const queryVector = this.textToVector(query);
    
    const scores = this.chunks.map((chunk, index) => ({
      chunk: chunk,
      score: this.cosineSimilarity(queryVector, this.vectors[index])
    }));

    // 按相似度降序排列，取前 topK 个
    scores.sort((a, b) => b.score - a.score);
    const results = scores.slice(0, topK).filter(s => s.score > 0.05);

    return results;
  }

  // ===== 对外接口：加载文档并构建索引 =====
  loadAndIndex(filePath) {
    console.log(`\n📄 正在加载文档: ${filePath}`);
    const text = fs.readFileSync(filePath, 'utf-8');
    console.log(`   文档长度: ${text.length} 字`);

    // Step 1: Chunking
    this.chunkDocument(text);

    // Step 2: Embedding
    this.embedAllChunks();

    console.log(`\n✅ RAG 引擎就绪！共 ${this.chunks.length} 个文本块可供检索\n`);
  }

  // 获取检索到的上下文文本（注入 prompt 用）
  getContext(query, topK = 3) {
    const results = this.search(query, topK);
    
    if (results.length === 0) {
      return { context: '', results: [] };
    }

    const context = results.map(r => 
      `【${r.chunk.title}】(相似度: ${(r.score * 100).toFixed(1)}%)\n${r.chunk.content}`
    ).join('\n\n---\n\n');

    return { context, results };
  }
}

module.exports = RAGEngine;
