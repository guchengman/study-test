# 配置说明（Configuration）

本项目为 **React 19 + TypeScript + Vite（前端）/ Express + MySQL（后端）** 全栈应用。
密钥与敏感配置通过环境变量管理，**切勿在源码中硬编码**。

## 前端（Web / Electron）

前端仅在浏览器中运行，**不应包含任何服务端密钥**。AI Key 由用户在本机「设置」中填写，
保存在浏览器 `sessionStorage` / `localStorage`，不会上报服务器。

- 构建期注入的 Key（`vite.config.ts` 的 `define`）在生产构建中会被剥离为空字符串；
  生产环境走服务端代理（`/api/ai`）或用户自行填写。
- 可选前端环境变量（放在根目录 `.env`，仅开发期有效）：
  - `VITE_PADDLEOCR_API_KEY`：PaddleOCR API Key（可选；不填则用户需在前端设置中自填并持久化到 localStorage）。

## 后端（server/）

复制 `server/.env.example` 为 `server/.env` 并填写：

| 变量 | 说明 |
|------|------|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL 连接信息 |
| `JWT_SECRET` | 生产必填，≥16 字符（建议 ≥32） |
| `GEMINI_API_KEY` | 服务端 Gemini 代理密钥（可选） |
| `BAIDU_API_KEY` / `BAIDU_SECRET_KEY` | 百度 OCR（可选） |
| `ALLOWED_ORIGINS` | 允许跨域的源，逗号分隔（如 `http://localhost:3000,http://localhost:5173`）；为空则仅允许同源 |
| `PORT` | 后端端口，默认 3100 |
| `TRUST_PROXY` | 反向代理后需真实 IP 时设为 `1` |

## 安全须知

- 切勿将 `.env` / 含密钥的脚本提交到版本库（已被 `.gitignore` 忽略）。
- 运维脚本的数据库密码、SSH 私钥路径等一律从环境变量读取（如 `DB_PASSWORD`、`SSH_KEY_PATH`），不在代码中写死。
