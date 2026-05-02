# 学习题库助手 Chrome 扩展

一个可以随时随地练习题库的 Chrome 扩展程序。

## 功能特性

- 📚 浏览题库科目
- ✏️ 随机答题练习
- 📊 查看练习成绩
- 🔄 错题重做

## 安装方法

### 1. 准备图标（可选）

Chrome Web Store 需要 PNG 图标。您可以使用以下尺寸的图标：
- 16x16 像素 (icon16.png)
- 48x48 像素 (icon48.png)
- 128x128 像素 (icon128.png)

您可以使用任何图标制作工具创建这些图标，或者使用在线工具如 [Favicon Generator](https://favicon.io/)。

**临时测试**：如果不发布到 Web Store，可以将 manifest.json 中的图标路径改为您已有的图片。

### 2. 加载扩展程序

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `chrome-extension` 文件夹

### 3. 使用扩展

1. 点击 Chrome 工具栏上的扩展图标
2. 使用已有账号登录，或注册新账号
3. 选择科目开始练习

## 发布到 Chrome Web Store

### 1. 准备开发者账号

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 注册开发者账号（需支付 $5 注册费）

### 2. 打包扩展

```bash
# 在 chrome-extension 目录中
zip -r ../study-quiz-extension.zip *
```

### 3. 上传发布

1. 登录 Chrome Web Store Developer Dashboard
2. 点击"添加新项目"
3. 上传打包好的 .zip 文件
4. 填写应用信息、截图、描述等
5. 提交审核

### 4. 注意事项

- 图标必须使用 PNG 格式
- 需要提供隐私权政策页面链接
- 扩展程序需要通过 Google 审核
- 审核可能需要几天时间

## 文件结构

```
chrome-extension/
├── manifest.json      # 扩展配置文件
├── popup.html         # 弹出窗口界面
├── popup.js           # 弹出窗口逻辑
├── background.js      # 后台脚本
├── icons/
│   ├── icon16.png     # 小图标
│   ├── icon48.png     # 中等图标
│   └── icon128.png    # 大图标
└── README.md          # 说明文档
```

## API 接口

扩展会调用您后端的以下接口：

- `POST /api/auth/login` - 登录
- `POST /api/auth/register` - 注册
- `GET /api/subjects` - 获取科目列表
- `GET /api/questions/subject/:id` - 获取题目列表

确保您的后端 CORS 配置允许 Chrome 扩展访问。
