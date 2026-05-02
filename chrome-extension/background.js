// Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('学习题库助手已安装');
});

// 可选：在安装时打开选项页面
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 可以在这里添加一些初始化逻辑
  }
});
