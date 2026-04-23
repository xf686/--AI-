# 🤖 AI 办公助理 · Smart Office Bot

基于 MiniMax API 的智能办公助理 Chatbot，通过 Vibe Coding 方式快速构建。

## 产品定位

面向企业办公场景的 AI 对话助手，帮助员工高效处理日常文字类办公任务。

## 核心功能

| 功能 | 说明 | 典型场景 |
|------|------|----------|
| 📝 周报整理 | 碎片化工作记录 → 格式规范的周报 | 周五快速生成周报 |
| 📋 会议纪要 | 会议讨论内容 → 结构化纪要 | 会后 5 分钟输出纪要 |
| ✅ 待办提取 | 对话/文档 → 任务 + 责任人 + 截止日期 | 从讨论中提取 action items |
| 📧 邮件撰写 | 简要描述 → 专业工作邮件 | 快速起草通知邮件 |
| ✨ 文案润色 | 口语化表达 → 专业简洁文案 | 优化对外沟通文案 |

## 技术架构

```
浏览器 (前端)  →  Node.js 后端代理  →  MiniMax API
   HTML/CSS/JS       Express              MiniMax-M2
                   (保护 API Key)
```

- **前端**：原生 HTML/CSS/JS，无框架依赖
- **后端**：Node.js + Express，代理转发 API 请求，保护密钥安全
- **AI 模型**：MiniMax-M2（OpenAI 兼容格式）
- **Prompt 设计**：五段式结构（详见 [prompt.md](./prompt.md)）

## 项目结构

```
ai-office-assistant/
├── server.js          ← Node.js 后端（API 代理）
├── package.json       ← 依赖配置
├── .env.example       ← 环境变量模板
├── prompt.md          ← System Prompt 设计文档
├── README.md          ← 项目介绍
└── public/            ← 前端文件
    ├── index.html     ← 页面结构
    ├── style.css      ← UI 样式
    └── app.js         ← 交互逻辑
```

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env，填入你的 MiniMax API Key

# 3. 启动服务
npm start

# 4. 打开浏览器访问
# http://localhost:3000
```

## 后续规划

- [ ] 接入飞书开放平台，部署为飞书 Bot
- [ ] 接入企业微信，部署为企微 Bot
- [ ] 嵌入网站，作为在线客服使用
- [ ] 增加 RAG，支持企业内部知识库检索
- [ ] 建立 Eval 数据集，持续优化输出质量

## 开发方式

本项目采用 **Vibe Coding** 方式开发——通过自然语言描述需求，借助 AI 工具快速生成代码并迭代，从想法到可运行 Demo 仅用数小时。
