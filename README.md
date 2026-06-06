# 罕见病临床工作台 MVP

面向 PKU / MMA 样本病例的临床数据结构化与医生端问答原型。

## 功能

- 病例队列、病例摘要、指标趋势、病程时间轴
- 证据页面分类、治疗与营养、医生审核清单
- 病例 AI 问答面板
- 无密钥时使用本地病例上下文兜底回答
- 配置 `OPENAI_API_KEY` 后可通过 `/api/chat` 调用 OpenAI Responses API

## 启动

静态前端兜底：

```bash
python3 -m http.server 8000
```

带 AI 后端：

```bash
npm run dev
```

后端会自动读取本地 `.env`：

```bash
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4.1
```

如果不设置 `OPENAI_API_KEY`，`npm run dev` 会返回本地病例上下文兜底回答。

## 验证

```bash
npm test
node --check src/app.js
node --check server.js
```

## 医疗边界

本项目仅用于医生端资料整理和临床决策支持演示，不提供独立诊断、处方或患者自助诊疗能力。
