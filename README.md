# Veil Local Assistant

Veil 是一个面向编程工作的 macOS 桌面聊天助手。它默认连接本机 Ollama，也支持 Google Gemini、DeepSeek 和其他兼容 OpenAI Chat Completions 的 API。

## 功能

- 顶部统一快捷切换已配置的 Ollama、本地模型和在线 API 模型
- 一个服务商可添加任意多个模型名，共用该服务商的 API Key
- Gemini 与 DeepSeek 预设，以及独立的 thinking 开关映射
- 流式输出、关键进度、思考字数和生成速度展示
- 会话历史折叠、归档、恢复和永久删除
- 适合四分之一屏幕的小窗口布局
- 无圆角黑色矩形回复/输入区的透明提词器模式、自动置顶和可自定义全局快捷键
- 可编辑、恢复、清空并真正禁用系统提示词
- 本机 SQLite 个人题库，支持 FTS5 + Qwen3 Embedding 混合检索和 Qwen3 Reranker 精排
- API Key 仅保存在应用主进程的数据目录；macOS 支持时通过 Electron `safeStorage` 加密

## 本地开发

需要 Node.js 16+、npm 和 Apple 芯片 Mac：

```bash
npm install
npm start
```

默认 Ollama 地址是 `http://127.0.0.1:11434`。Ollama 连接只接受本机回环地址；远程兼容 API 必须使用 HTTPS。

## API 配置

在应用右上角打开“模型与助手设置”，选择服务类型，添加一个或多个模型名并填写 API Key：

- Google Gemini：预设 OpenAI 兼容地址，可修改模型名
- DeepSeek：预设官方 API 地址，同一 Key 可添加多个可用模型名
- OpenAI 兼容：可连接其他使用 `/chat/completions` 流式协议的服务

API 对话会发送给所选服务商；选择 Ollama 时对话只发送给本机 Ollama。

## 本地个人题库

题库使用应用数据目录内的 `knowledge-base.sqlite3`，不会在线共享。设置页可导入 JSON、JSONL、CSV、TXT 或 Markdown；检索时先合并 SQLite FTS5 关键词结果和向量结果，再按需调用本地 Reranker 精排。

默认模型名为 `veil-qwen3-embedding:0.6b-q8` 和 `veil-qwen3-reranker:0.6b-int8`。它们需要先存在于 Ollama；设置页允许改成其他兼容模型名。16GB Mac 不会让聊天模型、Embedding 和 Reranker 长时间同时常驻，Reranker 不可用时会自动退回混合排序。

## 录屏保护

录屏保护可在顶部盾牌按钮或设置中开关。应用通过 Electron `setContentProtection` 请求系统保护窗口。实际效果取决于 macOS 版本和录屏软件采用的捕获接口，新版 ScreenCaptureKit 下不能视为绝对防护。

## 测试

```bash
npm run check
```

## License

[MIT](LICENSE)
