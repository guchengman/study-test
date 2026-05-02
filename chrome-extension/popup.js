// 配置
const API_BASE = 'https://www.xiaoyue.shop/api';

// 状态管理
let currentUser = null;
let subjects = [];
let currentSubject = null;
let practiceQuestions = [];
let currentQuestionIndex = 0;
let selectedAnswers = [];
let correctCount = 0;

// DOM 元素
const authPage = document.getElementById('authPage');
const mainPage = document.getElementById('mainPage');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const subjectsSection = document.getElementById('subjectsSection');
const subjectList = document.getElementById('subjectList');
const practiceContainer = document.getElementById('practiceContainer');
const resultContainer = document.getElementById('resultContainer');
const questionCard = document.getElementById('questionCard');

// 初始化
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // 检查是否已登录
  const stored = await chrome.storage.local.get(['user', 'token']);
  if (stored.user && stored.token) {
    currentUser = stored.user;
    showMainPage();
    loadSubjects();
  } else {
    showAuthPage();
  }
  
  // 绑定事件
  bindEvents();
}

function bindEvents() {
  // 登录
  loginForm.addEventListener('submit', handleLogin);
  
  // 注册切换
  document.getElementById('showRegister').addEventListener('click', () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  });
  document.getElementById('showLogin').addEventListener('click', () => {
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
  });
  
  // 注册
  registerForm.addEventListener('submit', handleRegister);
  
  // 退出
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  
  // 返回主页
  document.getElementById('backHomeBtn').addEventListener('click', showSubjectsView);
  document.getElementById('backToSubjects').addEventListener('click', showSubjectsView);
  
  // 重试
  document.getElementById('retryBtn').addEventListener('click', () => {
    startPractice();
  });
  
  // 提交答案
  document.getElementById('submitAnswer').addEventListener('click', submitAnswer);
}

// 认证相关
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      document.getElementById('loginError').textContent = data.error || '登录失败';
      return;
    }
    
    currentUser = data.user;
    await chrome.storage.local.set({ user: data.user, token: data.token });
    showMainPage();
    loadSubjects();
  } catch (err) {
    document.getElementById('loginError').textContent = '网络错误，请重试';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;
  
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      document.getElementById('regError').textContent = data.error || '注册失败';
      return;
    }
    
    currentUser = data.user;
    await chrome.storage.local.set({ user: data.user, token: data.token });
    showMainPage();
    loadSubjects();
  } catch (err) {
    document.getElementById('regError').textContent = '网络错误，请重试';
  }
}

async function handleLogout() {
  await chrome.storage.local.remove(['user', 'token']);
  currentUser = null;
  showAuthPage();
}

// 页面切换
function showAuthPage() {
  authPage.style.display = 'block';
  mainPage.style.display = 'none';
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
}

function showMainPage() {
  authPage.style.display = 'none';
  mainPage.style.display = 'block';
  document.getElementById('currentUser').textContent = currentUser?.username || '未登录';
}

// 科目相关
async function loadSubjects() {
  try {
    const stored = await chrome.storage.local.get('token');
    const res = await fetch(`${API_BASE}/subjects`, {
      headers: { 'Authorization': `Bearer ${stored.token}` }
    });
    
    if (!res.ok) throw new Error('获取科目失败');
    
    const data = await res.json();
    subjects = data.subjects || [];
    renderSubjects();
  } catch (err) {
    subjectList.innerHTML = `<div class="error-message">加载失败: ${err.message}</div>`;
  }
}

function renderSubjects() {
  if (subjects.length === 0) {
    subjectList.innerHTML = `
      <div class="empty-state">
        <div class="icon">📚</div>
        <p>暂无科目</p>
      </div>
    `;
    return;
  }
  
  subjectList.innerHTML = subjects.map(s => `
    <div class="subject-item" data-id="${s.id}">
      <span class="icon">${s.icon || '📚'}</span>
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="count">${s.question_count || 0} 道题目</div>
      </div>
      <span class="arrow">→</span>
    </div>
  `).join('');
  
  // 绑定点击事件
  subjectList.querySelectorAll('.subject-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      currentSubject = subjects.find(s => s.id === id);
      startPractice();
    });
  });
}

// 练习相关
async function startPractice() {
  if (!currentSubject) return;
  
  try {
    // 获取题目
    const stored = await chrome.storage.local.get('token');
    const res = await fetch(`${API_BASE}/questions/subject/${currentSubject.id}?limit=20`, {
      headers: { 'Authorization': `Bearer ${stored.token}` }
    });
    
    if (!res.ok) throw new Error('获取题目失败');
    
    const data = await res.json();
    practiceQuestions = data.questions || [];
    
    if (practiceQuestions.length === 0) {
      alert('该科目暂无题目');
      return;
    }
    
    // 随机打乱
    practiceQuestions = shuffleArray([...practiceQuestions]);
    
    // 重置状态
    currentQuestionIndex = 0;
    selectedAnswers = [];
    correctCount = 0;
    
    // 显示练习页面
    showPracticeView();
    renderQuestion();
  } catch (err) {
    alert('加载题目失败: ' + err.message);
  }
}

function showPracticeView() {
  subjectsSection.style.display = 'none';
  practiceContainer.style.display = 'block';
  resultContainer.style.display = 'none';
  document.getElementById('practiceTitle').textContent = currentSubject?.name || '练习';
}

function showSubjectsView() {
  subjectsSection.style.display = 'block';
  practiceContainer.style.display = 'none';
  resultContainer.style.display = 'none';
  loadSubjects();
}

function showResultView() {
  subjectsSection.style.display = 'none';
  practiceContainer.style.display = 'none';
  resultContainer.style.display = 'block';
  
  const total = practiceQuestions.length;
  const percentage = Math.round((correctCount / total) * 100);
  
  document.getElementById('resultScore').textContent = `${percentage}%`;
  document.getElementById('resultDetail').textContent = `答对 ${correctCount} 题，共 ${total} 题`;
  
  if (percentage >= 80) {
    document.getElementById('resultIcon').textContent = '🎉';
    document.getElementById('resultTitle').textContent = '太棒了！';
  } else if (percentage >= 60) {
    document.getElementById('resultIcon').textContent = '👍';
    document.getElementById('resultTitle').textContent = '还不错！';
  } else {
    document.getElementById('resultIcon').textContent = '💪';
    document.getElementById('resultTitle').textContent = '继续加油！';
  }
}

function renderQuestion() {
  const q = practiceQuestions[currentQuestionIndex];
  const total = practiceQuestions.length;
  
  // 更新进度
  document.getElementById('progressFill').style.width = `${((currentQuestionIndex) / total) * 100}%`;
  document.getElementById('progressText').textContent = `${currentQuestionIndex + 1} / ${total}`;
  
  // 判断题目类型
  const typeLabel = q.type === 'single' ? '单选题' : q.type === 'multiple' ? '多选题' : '编程题';
  const typeClass = q.type === 'single' ? 'single' : q.type === 'multiple' ? 'multiple' : 'programming';
  
  // 渲染题目
  let optionsHtml = '';
  if (q.options && q.options.length > 0) {
    const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    optionsHtml = `
      <div class="options">
        ${q.options.map((opt, i) => `
          <div class="option-item" data-index="${i}">
            <span class="key">${keys[i]}</span>
            <span class="text">${opt}</span>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    optionsHtml = '<p style="color:#64748b;text-align:center;">本题无选项</p>';
  }
  
  questionCard.innerHTML = `
    <span class="question-type ${typeClass}">${typeLabel}</span>
    <div class="question-title">${q.title}</div>
    ${optionsHtml}
  `;
  
  // 绑定选项点击事件
  questionCard.querySelectorAll('.option-item').forEach(item => {
    item.addEventListener('click', () => {
      if (q.type === 'multiple') {
        item.classList.toggle('selected');
      } else {
        questionCard.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
      }
      updateSubmitButton();
    });
  });
  
  // 重置提交按钮
  document.getElementById('submitAnswer').disabled = true;
  document.getElementById('submitAnswer').textContent = '提交答案';
}

function updateSubmitButton() {
  const selected = questionCard.querySelectorAll('.option-item.selected');
  const hasSelection = selected.length > 0;
  document.getElementById('submitAnswer').disabled = !hasSelection;
}

function submitAnswer() {
  const q = practiceQuestions[currentQuestionIndex];
  const selectedItems = questionCard.querySelectorAll('.option-item.selected');
  const selectedIndices = Array.from(selectedItems).map(item => parseInt(item.dataset.index));
  
  // 计算正确答案
  let correctIndices = [];
  if (Array.isArray(q.answer)) {
    correctIndices = q.answer.map(a => {
      const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
      return keys.indexOf(a);
    }).filter(i => i >= 0);
  } else {
    const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    correctIndices = [keys.indexOf(q.answer)];
  }
  
  // 判断对错
  const isCorrect = selectedIndices.length === correctIndices.length && 
                    selectedIndices.every(i => correctIndices.includes(i));
  
  if (isCorrect) correctCount++;
  
  // 显示正确答案
  selectedItems.forEach(item => {
    const idx = parseInt(item.dataset.index);
    if (correctIndices.includes(idx)) {
      item.classList.add('correct');
    } else {
      item.classList.add('wrong');
    }
  });
  
  // 更新进度条
  const total = practiceQuestions.length;
  document.getElementById('progressFill').style.width = `${((currentQuestionIndex + 1) / total) * 100}%`;
  
  // 修改按钮
  const submitBtn = document.getElementById('submitAnswer');
  submitBtn.textContent = currentQuestionIndex < total - 1 ? '下一题 →' : '查看结果';
  submitBtn.disabled = false;
  submitBtn.onclick = nextQuestion;
}

function nextQuestion() {
  currentQuestionIndex++;
  
  if (currentQuestionIndex >= practiceQuestions.length) {
    showResultView();
  } else {
    renderQuestion();
  }
}

// 工具函数
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
