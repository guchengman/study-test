# ImportModal 按钮点击问题修复方案

## 问题描述
配置完API后返回导入题目页面，"生成题目"按钮无法点击，需要关闭页面重新打开才能使用。

## 根本原因
1. 按钮状态仅依赖于 `promptInput` 的当前值
2. 组件没有监听 API 配置的变化
3. 用户从设置页面返回时，组件状态未重置

## 修复方案

### 方案1：添加 API 配置变化监听（推荐）

在 `ImportModal.tsx` 中添加对 API 配置变化的监听：

```tsx
// 在现有的 useEffect 之后添加
useEffect(() => {
  // 监听 API 配置变化
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'AI_SETTINGS' || e.key === null) {
      // 强制刷新组件状态或重新验证按钮可用性
      // 这里可以触发一个微小的状态更新来重新渲染按钮
      setForceUpdate(prev => !prev);
    }
  };

  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);

const [forceUpdate, setForceUpdate] = useState(false);
```

### 方案2：改进按钮禁用逻辑

修改按钮的禁用条件，使其更加智能：

```tsx
// 修改现有的按钮禁用逻辑
const canGenerate = promptInput.trim().length > 0 || 
                   (text.trim().length > 0 && selectedModel !== 'gemini-3-flash-preview');

<button
  onClick={handleGenerateFromPrompt}
  disabled={!canGenerate || isGenerating}
  className="..."
>
  {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
  生成题目
</button>
```

### 方案3：在 SettingsModal 关闭时触发回调（最佳方案）

修改 `SettingsModal` 的 onClose 回调，在关闭设置时通知父组件刷新：

```tsx
// 在 ImportModal.tsx 中
const [settingsVersion, setSettingsVersion] = useState(0);

const handleSettingsClose = () => {
  setIsSettingsOpen(false);
  // 触发版本更新，强制重新计算按钮状态
  setSettingsVersion(prev => prev + 1);
};

// 然后在 SettingsModal 调用中使用这个回调
<SettingsModal 
  isOpen={isSettingsOpen} 
  onClose={handleSettingsClose} 
  authUser={authUser} 
/>
```

## 临时解决方案（立即可用）

如果不想修改代码，用户可以：

1. **在设置页面配置完API后，不要直接返回**
2. **先在导入页面输入任意字符到提示词框，然后删除**
3. **这样会触发状态更新，按钮就会恢复正常**

或者更简单的方法：
- **配置完API后，按 F5 刷新整个页面**