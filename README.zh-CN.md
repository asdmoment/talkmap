# Realtime Voice Map 中文说明

Realtime Voice Map 是一个本地优先的原型项目。
它会在浏览器里采集麦克风音频，把语音片段发到 FastAPI 后端，再把结果整理成三块内容：逐步成形的转录、滚动摘要、以及思维导图。

## 现在能做什么

- 浏览器里打开麦克风并开始录音
- 通过 WebSocket 把一句话的音频片段发给后端
- 后端生成转录事件、摘要事件和脑图事件
- 前端把 transcript / summary / mind map 实时渲染出来
- 会话快照会落到本地磁盘
- 支持导出 JSON 和 Markdown

## 运行前准备

- Python 3.11+
- Node.js 18+
- Ollama
- 如果你想跑完整的本地语音链路，还需要安装 `faster-whisper`

## 快速开始

### 1. 安装后端依赖

建议先建一个虚拟环境：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e "backend[dev,asr]"
pip install uvicorn
```

如果你暂时只想看接口和前端壳子，不跑本地 ASR，也可以先不装 `asr` extra：

```bash
pip install -e "backend[dev]"
pip install uvicorn
```

### 2. 安装前端依赖

```bash
npm --prefix frontend install
```

### 3. 准备 LLM 提供方

默认还是用 Ollama，本地体验最直接。先把模型拉下来，再启动服务：

```bash
ollama pull llama3.1:8b
ollama serve
```

如果你想切换到别的 provider，可以复制 `.env.example`：

```bash
cp .env.example .env
```

## 启动项目

### 启动后端

```bash
uvicorn app.main:app --app-dir backend --reload
```

默认地址是 `http://127.0.0.1:8000`。

### 启动前端

```bash
npm --prefix frontend run dev
```

默认前端地址是 `http://127.0.0.1:5173`。

开发模式下，Vite 已经把 `/api` 和 `/ws` 代理到后端的 `127.0.0.1:8000`，所以前后端分开跑就行，不需要自己再改前端地址。

## LLM provider 选择

后端摘要器现在支持四种 provider，通过 `LLM_PROVIDER` 切换：

- `ollama`：默认本地适配器，使用 `OLLAMA_BASE_URL` 和 `OLLAMA_MODEL`
- `lmstudio`：本地 OpenAI 兼容接口，使用 `LMSTUDIO_BASE_URL` 和 `LMSTUDIO_MODEL`
- `openai`：OpenAI 官方接口，使用 `OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_API_KEY`
- `openrouter`：OpenRouter 接口，使用 `OPENROUTER_BASE_URL`、`OPENROUTER_MODEL`、`OPENROUTER_API_KEY`

可以参考下面这些 `.env` 片段：

```bash
# Ollama 仍然是默认本地配置
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1:8b

# LM Studio
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL=local-model

# OpenAI
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY=your-api-key

# OpenRouter
LLM_PROVIDER=openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_API_KEY=your-api-key
```

## 实际怎么用

1. 打开 `http://127.0.0.1:5173`
2. 点 `Start desk`
3. 允许浏览器访问麦克风
4. 开始说话
5. 每段语音结束后，前端会把这一段 utterance 发到后端
6. 后端处理完后，页面会更新三块内容：
   - `Transcript`：转录内容
   - `Summary`：滚动摘要、要点、行动项
   - `Mind Map`：当前主题关系图

如果链路里某一步失败，比如 WebSocket 断开、ASR 不可用、Ollama / LM Studio / OpenAI / OpenRouter 配置不对，界面里会显示错误状态。

## 导出会话

当前界面还没有导出按钮，先走接口。

### 第一步：找到 session id

会话启动后，后端会把快照写到：

```bash
data/sessions/
```

目录里的文件名就是 session id，比如：

```bash
data/sessions/session-ab12cd34.json
```

这里的 `session-ab12cd34` 就是你要用的 id。

### 第二步：导出

导出 JSON：

```bash
curl "http://127.0.0.1:8000/api/session/session-ab12cd34/export.json"
```

导出 Markdown：

```bash
curl "http://127.0.0.1:8000/api/session/session-ab12cd34/export.md"
```

JSON 更适合后续处理，Markdown 更适合直接看内容。

## 常用接口

- `GET /api/health`
- `GET /api/session/{id}/export.json`
- `GET /api/session/{id}/export.md`
- `WS /ws/session`

## 运行测试

后端：

```bash
python -m pytest backend/tests -v
```

前端：

```bash
npm --prefix frontend test
```

前端打包：

```bash
npm --prefix frontend run build
```

## 环境变量说明

根目录的 `.env.example` 里放了目前常用的本地配置，比如：

- `LLM_PROVIDER`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_SECONDS`
- `LMSTUDIO_BASE_URL`
- `LMSTUDIO_MODEL`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_MODEL`
- `OPENROUTER_API_KEY`
- `ASR_MODEL`
- `ASR_DEVICE`
- `ASR_COMPUTE_TYPE`
- `VOICE_MAP_DATA_DIR`

现在摘要 provider 的切换变量已经接进运行时；Ollama 仍然是默认的本地开发路径。

## 当前限制

- 这是 MVP，主要面向本机开发和联调，不是生产部署方案
- 前端还没有导出按钮，导出先走后端接口
- 会话一建立就会落一个空 snapshot，所以你可能会在 `data/sessions/` 里看到还没说话的空会话
- 摘要和脑图现在按“整段 committed transcript”重算，长会话下还可以继续优化
- 错误恢复已经有基础处理，但还没有做完整的自动重连策略

## 文件说明

- 英文说明：`README.md`
- 中文说明：`README.zh-CN.md`
