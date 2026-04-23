/**
 * AI 办公助理 · 前端交互逻辑
 * 通过本地后端代理调用 MiniMax API
 */

// ===== 应用状态 =====
let conversationHistory = [];
let isProcessing = false;

// ===== DOM 元素 =====
const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const welcome = document.getElementById('welcome');
const quickActions = document.getElementById('quickActions');

// ===== 初始化 =====
function init() {
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  });
}

// ===== 键盘事件 =====
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ===== 快捷消息 =====
function sendQuick(text) {
  userInput.value = text;
  sendMessage();
}

// ===== Modal =====
function toggleModal() {
  document.getElementById('promptModal').classList.toggle('active');
}

function closeModalOutside(e) {
  if (e.target === e.currentTarget) toggleModal();
}

// ===== 工具函数 =====
function getTimeStr() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatMarkdown(text) {
  let html = text
    .replace(/^### (.+)$/gm, '<strong style="font-size:14px;display:block;margin:10px 0 4px;">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong style="font-size:15px;display:block;margin:12px 0 6px;">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre>$2</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[·•\-] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  html = html.replace(/((?:<li>.*?<\/li>\s*(?:<br>)?)+)/g, '<ul>$1</ul>');
  html = html.replace(/<ul>\s*<br>/g, '<ul>');
  html = html.replace(/<\/li>\s*<br>\s*<li>/g, '</li><li>');

  return `<p>${html}</p>`;
}

// ===== 消息渲染 =====
function addMessage(role, content) {
  if (welcome) welcome.style.display = 'none';
  quickActions.style.display = 'flex';

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  const avatarClass = role === 'bot' ? 'bot' : 'user-av';
  const avatarEmoji = role === 'bot' ? '🤖' : '👤';
  const formattedContent = role === 'bot'
    ? formatMarkdown(content)
    : content.replace(/\n/g, '<br>');

  msgDiv.innerHTML = `
    <div class="msg-avatar ${avatarClass}">${avatarEmoji}</div>
    <div>
      <div class="msg-bubble">${formattedContent}</div>
      <div class="msg-time">${getTimeStr()}</div>
    </div>
  `;

  chatContainer.insertBefore(msgDiv, typingIndicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ===== 核心：发送消息 =====
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isProcessing) return;

  isProcessing = true;
  userInput.value = '';
  userInput.style.height = 'auto';
  sendBtn.disabled = true;

  addMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  typingIndicator.classList.add('active');
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    // 调用本地后端代理，而不是直接调用 MiniMax API
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error + (data.detail ? `\n${data.detail}` : ''));
    }

    const reply = data.reply;
    conversationHistory.push({ role: 'assistant', content: reply });

    typingIndicator.classList.remove('active');
    addMessage('bot', reply);

  } catch (err) {
    typingIndicator.classList.remove('active');
    addMessage('bot', '⚠️ 请求失败，请检查后端服务是否运行。\n\n错误信息：' + err.message);
  }

  isProcessing = false;
  sendBtn.disabled = false;
  userInput.focus();
}

// ===== 启动 =====
init();
