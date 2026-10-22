# dsh-model-extra-config

ccswitch 风格的模型请求覆盖插件（DeepSeek Harness）。

在**模型设置页每个 provider 卡片**上追加编辑区，为每个 provider 路由配置：

- **Body 覆盖**：任意 JSON 顶层字段，与发出的请求 body **深合并**（嵌套对象逐层合并，`null` 删除字段）。
  例：OpenRouter 指定渠道 `{"provider":{"only":["GPT Hub 3"],"order":["GPT Hub 3","GPT Hub 1"]}}`
- **Header 覆盖**：附加/覆盖任意 HTTP header。
- **模型级覆盖**：provider 内按模型单独配置，优先级高于 provider 级（模型级 `body.only` 只替换该字段，不动 provider 级的 `order`）。

## 生效范围

- 自定义 OpenAI / Anthropic 兼容 provider（含各种中转站）与官方 DeepSeek 路由的**模型对话请求**（`/chat/completions`、`/responses`、`/messages`）。
- 模型发现等 GET 请求只应用 provider 级 header（无 body、无模型维度）。
- 响应（含 SSE 流）原样透传；不匹配任何已配置路由的请求原样放行。

## 实现方式

Host 侧对进程级 `globalThis.fetch` 做一层按 baseURL 前缀匹配的包装（内置 LLM adapter 均通过它发请求），不改写任何 adapter 内部；配置字段是 volatile 的，保存后**立即生效**，无需重启。

## 图形配置
<img width="1612" height="1370" alt="image" src="https://github.com/user-attachments/assets/831a4b78-3060-403d-a2dc-4fbf38b3097e" />
<img width="1606" height="1362" alt="image" src="https://github.com/user-attachments/assets/2ceb7420-c284-43c4-b5fc-e84db62a90f5" />

## 手动配置（cordis.patch.yml）

```yaml
- id: dsh-model-extra-config
  name: dsh-model-extra-config
  config:
    overrides:
      openrouter:            # provider 路由名
        body:
          provider: { only: ["GPT Hub 3"] }
        headers: {}
        models:
          openai/gpt-4o:
            body:
              provider: { only: ["GPT Hub 1"] }
```

## 已知限制

- 使用 `websocket` transport 的 pi-ai provider 不经过 fetch，覆盖不生效（默认 transport 不受影响）。
- 同一 baseURL 被多个 provider 路由使用时，取 baseURL 最长匹配的路由。
