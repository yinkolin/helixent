# 上下文压缩技术方案（Helixent CLI 适配版）

## 1. 背景与目标

Helixent CLI 是一个基于 Agent Loop + ReAct 模式的交互式编码助手，在长任务场景中会持续累积以下几类上下文负担：

- 多轮对话历史不断增长，逐步逼近模型上下文窗口上限
- 工具调用结果过长，尤其是 `bash`、`read_file` 等工具会快速放大 token 消耗
- 历史被截断后，模型容易忘记仍然有效的工作状态（例如 todo 列表）
- 当前 `/clear` 只清空 TUI 展示，不会真正清空 Agent 内部累积的消息历史

思路不是做单点“压缩器”，而是组合多层机制：

1. 对高膨胀工具输出做结果截断（收益最高）
2. 对长历史做摘要压缩
3. 把长期稳定信息（AGENTS.md）抽离为 memory 注入
4. 在压缩后对关键状态（todo）做补偿注入，避免“压缩后失忆”

本方案面向 Helixent CLI 项目，目标是复用现有架构（middleware、todo 系统、skills 体系），构建一套可配置、渐进式、低侵入的上下文压缩体系。

---

## 2. 项目现状与适配点

### 2.1 已具备的基础设施

| 现有组件 | 位置 | 可以复用做什么 |
|---------|-----|--------------|
| `AgentMiddleware` | `src/agent/agent-middleware.ts` | 压缩 middleware 的扩展点 |
| `todoMiddleware` / `todoTool` | `src/agent/todos/todos.ts` | 结构化状态存储、Phase 4 的 todo reminder 注入 |
| `skillsMiddleware` | `src/agent/skills/skills-middleware.ts` | 参考其 factory 模式来组织压缩 middleware |
| `createCodingAgent` | `src/coding/agents/lead-agent.ts` | middleware 接入点 |
| `AGENTS.md` 自动加载 | `src/coding/agents/lead-agent.ts` | Phase 3 的 memory 注入雏形 |
| `summarizeToolResult` | `src/cli/tui/components/message-history.tsx` | 工具输出隐藏逻辑，可以扩展为截断 |

### 2.2 当前痛点

- 工具输出在进入模型时是完整的，只是在 TUI 展示时被隐藏
- `/clear` 只清空 `useAgentLoop` 里的 `messages` 状态，`Agent` 内部 `messages` 仍在累积
- 没有 token 估算机制
- 没有历史摘要机制

---

## 3. 设计原则

### 3.1 压缩优先级

上下文控制遵循以下优先级：

1. 先限制工具输出膨胀
2. 再压缩历史消息
3. 最后补偿关键状态

原因是工具输出通常是最不经济的上下文来源，优先处理其收益最大。

### 3.2 不做“盲删”，只做“可恢复压缩”

压缩后的系统仍应保留任务连续性，至少保留以下信息：

- 当前任务目标
- 已完成的关键步骤
- 当前未完成事项
- 与后续推理强相关的约束、结论、失败尝试

### 3.3 结构化状态优先于自然语言历史

如果某类状态可以结构化存储，就不要只依赖聊天历史保留：

- todo 列表（已有）
- 当前阶段
- 关键工件索引
- 长期记忆（AGENTS.md）
- 活跃子任务

### 3.4 压缩是 runtime 能力，不是 prompt 技巧

上下文压缩必须由运行时统一控制，而不是单纯让模型“自己总结一下”。原因是：

- 触发阈值必须稳定可控
- 压缩后的上下文需要可审计
- 补偿逻辑需要访问结构化状态
- 工具输出裁剪必须发生在模型输入之前

### 3.5 低侵入，复用现有扩展点

- 使用 `AgentMiddleware` 扩展，不要改 `Agent` 核心逻辑
- 使用 factory 函数创建 middleware，风格与 `createTodoSystem()`、`createSkillsMiddleware()` 一致
- 接入点仅在 `createCodingAgent()` 里加一行，其他地方不动

---

## 4. 总体架构（适配版）

建议把上下文处理拆成四层：

### 4.1 层一：工具输出瘦身

目标：在消息进入主上下文前，先限制单次工具结果的体积。

建议策略：

- `bash`：中间截断，保留头尾
- `read_file`：头部截断，保留开头与截断提示
- `ls`：头部截断，避免长目录列表占满上下文
- 其他高体积工具：按工具类型自定义截断策略

设计原因：

- 大部分长输出对后续推理并不需要全文
- 比起压缩整段对话，优先截断工具输出更省 token
- 可以最大限度保留最近对话，而不是被无关日志挤掉

**当前适配点：**

- 可以把当前 TUI 里的 `summarizeToolResult` 逻辑提前到 `beforeModel` 里
- 截断发生在进入 `modelContext.messages` 之前
- 不影响现有 `tool.invoke()` 行为

### 4.2 层二：历史摘要压缩

目标：当消息数、token 数或上下文占比达到阈值时，对旧历史做摘要压缩。

建议引入 `SummarizationMiddleware` 风格的运行时组件，支持：

- `messages` 阈值：消息条数达到 N 触发（第一阶段先用这个）
- `tokens` 阈值：token 数达到 N 触发（可选，后续加 token estimator）

压缩后保留两部分：

- 一段摘要消息
- 一小段近期原始消息

这样模型既知道“此前发生了什么”，也能看到“最近发生了什么”。

**当前适配点：**

- 第一阶段先用“消息数”触发，避免 token 估算复杂性
- 使用当前 `Model` 调用当前 `ModelProvider` 来生成摘要，复用现有调用链路

### 4.3 层三：长期记忆注入

目标：把跨轮次稳定存在、但不必每次从历史回放的信息，抽离为 memory。

适合放入 memory 的内容：

- `AGENTS.md`（已有雏形）
- 用户偏好
- 已确认的技术约束
- 长期结论
- 稳定事实

建议做法：

- 独立存储 memory（第一阶段直接用 `AGENTS.md`）
- 每轮在 system prompt 或高优先级上下文中注入
- 对 memory 注入设置单独 token 上限

这样可以避免模型必须依赖“超长历史”才能恢复背景信息。

**当前适配点：**

- 当前 `createCodingAgent` 已经会自动加载 `AGENTS.md` 到第一条消息里，可以继续复用这个模式

### 4.4 层四：关键状态补偿

目标：解决“摘要后历史没了，但状态还在”的问题。

典型案例：

- 原始 `todo_write` 调用被摘要掉了
- 但系统状态里仍有活跃 todo
- 模型如果看不到历史，会误以为没有 todo

因此需要在进入模型前做状态补偿：

- 如果结构化状态存在，但原始上下文已不可见
- 自动插入 reminder message
- 告诉模型哪些状态仍然有效，以及下一步该如何继续维护

**当前适配点：**

- 已经有结构化 todo 系统和 todo middleware
- 可以复用 `formatReminder` 这类现有逻辑

---

## 5. 推荐处理流程（适配版）

每次模型调用前，建议按以下顺序处理上下文：

1. 收集当前对话消息、工具结果、结构化状态
2. 对工具输出执行按类型截断
3. 评估是否达到摘要阈值
4. 若达到阈值，则对旧历史执行摘要压缩
5. 注入 memory（AGENTS.md）
6. 检查 todo、任务状态等是否因压缩而“脱离可见上下文”
7. 必要时插入补偿提醒
8. 生成最终模型输入

可表示为：

```text
原始消息
  -> 工具输出瘦身
  -> 历史摘要压缩
  -> memory 注入
  -> 状态补偿注入
  -> 最终模型上下文
```

---

## 6. 核心模块设计（适配版）

### 6.1 Tool Truncation Middleware

职责：

- 对高体积工具输出做统一裁剪
- 在 `beforeModel` 里修改 `modelContext.messages`

建议文件位置：
```
src/
└── agent/
    └── context-compression/
        ├── index.ts
        └── tool-truncator.ts
```

建议接口（TypeScript）：

```ts
import type { AgentMiddleware, NonSystemMessage } from "@/agent";

const TRUNCATION_CONFIG = {
  bash: { maxChars: 20000, mode: "middle" } as const,
  read_file: { maxChars: 50000, mode: "head" } as const,
  ls: { maxChars: 20000, mode: "head" } as const,
  str_replace: { maxChars: 10000, mode: "head" } as const,
} as const;

export function createToolTruncationMiddleware(): { middleware: AgentMiddleware } {
  function truncate(toolName: string, output: string): string {
    const config = (TRUNCATION_CONFIG as any)[toolName];
    if (!config) return output;
    if (output.length <= config.maxChars) return output;

    if (config.mode === "head") {
      const truncated = output.slice(0, config.maxChars);
      return `${truncated}\n\n[... truncated ${output.length - config.maxChars} chars ...]`;
    }

    if (config.mode === "middle") {
      const half = Math.floor(config.maxChars / 2);
      const head = output.slice(0, half);
      const tail = output.slice(-half);
      return `${head}\n\n[... truncated ${output.length - config.maxChars} chars ...]\n\n${tail}`;
    }

    return output;
  }

  const middleware: AgentMiddleware = {
    beforeModel: async ({ modelContext }) => {
      // 先构建 tool_use -> tool_name 的映射
      const toolUseMap = new Map<string, string>();
      for (const msg of modelContext.messages) {
        if (msg.role !== "assistant") continue;
        for (const content of msg.content) {
          if (content.type !== "tool_use") continue;
          toolUseMap.set(content.id, content.name);
        }
      }

      const truncatedMessages: NonSystemMessage[] = modelContext.messages.map((msg) => {
        if (msg.role !== "tool") return msg;
        return {
          ...msg,
          content: msg.content.map((content) => {
            if (content.type !== "tool_result") return content;
            const toolName = toolUseMap.get(content.tool_use_id) ?? "unknown";
            return {
              ...content,
              content: truncate(toolName, content.content),
            };
          }),
        };
      });

      return { messages: truncatedMessages };
    },
  };

  return { middleware };
}
```

### 6.2 Conversation Summarizer（可选，Phase 2）

职责：

- 判断是否触发摘要
- 选取需要被摘要的消息范围
- 使用当前 `Model` 生成摘要
- 保留最近若干消息

建议接口（TypeScript）：

```ts
import type { AgentMiddleware, Model, NonSystemMessage } from "@/agent";

export function createSummarizationMiddleware({
  model,
  triggerMessages = 40,
  keepRecent = 10,
}: {
  model: Model;
  triggerMessages?: number;
  keepRecent?: number;
}): { middleware: AgentMiddleware } {
  let summarized = false;

  const middleware: AgentMiddleware = {
    beforeModel: async ({ modelContext }) => {
      if (summarized || modelContext.messages.length < triggerMessages) {
        return;
      }

      // 这里用当前 model 做一次摘要调用
      // 然后把旧历史替换成摘要 + 最近 keepRecent 条
      // Phase 2 实现

      summarized = true;
      return;
    },
  };

  return { middleware };
}
```

### 6.3 Memory Manager（复用当前 AGENTS.md）

职责：

- 加载并注入 `AGENTS.md`（已有）
- 第一阶段直接复用当前逻辑

### 6.4 State Compensation Middleware（复用当前 todo 系统）

职责：

- 检查结构化 todo 是否仍存在
- 检查对应原始历史是否已经不可见
- 自动注入提醒消息

当前已有：
- todo 存储
- `formatReminder`
- todo middleware 里的 `beforeModel` 钩子

可以在 Phase 1 结束后直接复用现有逻辑。

---

## 7. 触发策略建议（适配版）

### 7.1 默认触发阈值

建议第一阶段先做“工具输出截断”，第二阶段再做“摘要压缩”。

**Phase 1（工具输出截断）：**
- 默认开启，无阈值，超过配置长度即截断

**Phase 2（摘要压缩）：**
- 第一阶段先用“消息数 >= 40”触发
- 后续再引入 token estimator，增加“token 阈值”

### 7.2 摘要后保留策略

建议默认保留：
- 最近 10 到 20 条消息

经验上，近期原始消息对下一步工具决策最关键。

### 7.3 工具输出限制

建议从保守值开始：
- `bash`: 20k chars
- `read_file`: 50k chars
- `ls`: 20k chars
- `str_replace`: 10k chars

后续再根据实际 token 使用调整。

---

## 8. 摘要内容规范（适配版）

为了保证摘要可复用，建议输出固定结构：

```text
任务目标：
已完成：
当前状态：
关键结论：
失败尝试：
未完成事项：
重要约束：
```

要求：
- 不要只做泛化总结
- 必须保留可操作信息
- 必须能支撑下一轮继续工作

---

## 9. 关键边界问题（适配版）

### 9.1 摘要后丢失状态

风险：
- 历史消息被压缩后，模型看不到此前的 todo/tool call

应对：
- 使用当前已有的结构化 todo 存储
- 复用 todo middleware 的 reminder 注入机制

### 9.2 压缩导致事实失真

风险：
- 摘要模型可能遗漏细节或写错结论

应对：
- 摘要 prompt 要强约束结构
- 关键事实尽量以结构化状态或 memory 保存
- Phase 1 不做摘要，先做工具输出截断，降低风险

### 9.3 过度压缩影响工具决策

风险：
- 保留近期消息太少，模型不知道刚刚做了什么

应对：
- 压缩后始终保留近期原始消息
- 把工具输出截断放在摘要前执行

### 9.4 `/clear` 只清 UI 不清上下文

风险：
- 当前 `/clear` 只清空 TUI 展示，`Agent` 内部 `messages` 仍在累积

应对：
- Phase 1 结束后，可以补一个真正清空 `agent.messages` 的机制

---

## 10. 可观测性与评估指标（适配版）

为保证策略可调优，建议第一阶段先从简单日志开始，不需要完整埋点系统：

- 每轮在 DEBUG 日志里输出：
  - 消息数
  - 工具输出截断次数
  - 是否触发摘要

后续再考虑更完整的指标。

---

## 11. 分阶段落地建议（适配版）

### Phase 1：先做工具输出截断（收益最高，风险最低）

**交付项：**
- `createToolTruncationMiddleware()`
- 在 `createCodingAgent()` 里接入
- 基础单元测试
- `~/clear` 真正清空上下文的改进（可选）

**改动文件：**
```
src/agent/context-compression/tool-truncator.ts  （新增）
src/agent/context-compression/index.ts          （新增）
src/coding/agents/lead-agent.ts                  （加一行 middleware 接入）
```

### Phase 2：接入摘要压缩（可选）

**交付项：**
- `createSummarizationMiddleware()`
- 消息数触发阈值
- 摘要 prompt
- 保留窗口策略
- 摘要前后消息数监控

### Phase 3：强化 memory 注入（可选）

**交付项：**
- 扩展当前 `AGENTS.md` 的加载逻辑
- 可选支持更多 memory 文件

### Phase 4：强化状态补偿（可选，已有雏形）

**交付项：**
- 复用当前 todo reminder 机制
- 在压缩后更激进地注入 todo reminder

---

## 12. 推荐接入方式（适配版）

### 12.1 Middleware 接入顺序

在 `src/coding/agents/lead-agent.ts` 里：

```ts
import { createToolTruncationMiddleware } from "@/agent/context-compression";

export async function createCodingAgent({ model, cwd, skillsDirs }: ...) {
  // ...
  const { tool: todoTool, middleware: todoMiddleware } = createTodoSystem();
  const { middleware: toolTruncationMiddleware } = createToolTruncationMiddleware();

  return new Agent({
    // ...
    middlewares: [
      createSkillsMiddleware(skillsDirs),
      toolTruncationMiddleware, // 👈 工具输出截断先执行
      todoMiddleware
    ],
  });
}
```

### 12.2 文件组织

推荐新增目录，与现有 `skills/`、`todos/` 保持一致：

```
src/
└── agent/
    ├── skills/              # 已有
    ├── todos/               # 已有
    ├── context-compression/ # 新增
    │   ├── index.ts
    │   └── tool-truncator.ts
    └── ...
```

---

## 13. 推荐配置草案（适配版）

```yaml
# 可以放在 ~/.helixent/config.yaml 里，或者代码里硬编码
context_compression:
  tool_truncation:
    enabled: true
    bash_max_chars: 20000
    read_file_max_chars: 50000
    ls_max_chars: 20000
    str_replace_max_chars: 10000

  summarization:
    enabled: false  # Phase 1 先关闭
    trigger:
      - type: messages
        value: 40
    keep:
      type: messages
      value: 10
```

---

## 14. 总结

最关键的结论是：

- 上下文压缩不是单一摘要能力
- 它本质上是一套 runtime context governance 机制
- 对于 Helixent CLI，完全可以基于现有 middleware、todo 系统、skills 体系来分层落地
- 不要一开始就追求“一套超级智能压缩器”，优先做 Phase 1（工具输出截断），收益最高，风险最低

只有把“压缩、保留、恢复、补偿”四件事一起设计，长任务 Agent 才能在有限上下文下稳定工作。
