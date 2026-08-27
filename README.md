# SkillCanvas

SkillCanvas 是一个面向普通用户的通用 AI Skill 生成器。用户可以只说一句模糊需求，系统会先用可见 Demo 校准理解，再把访谈结果、上传资料、专业知识、工具能力和评测要求编译成可编辑、可试跑、可导出的 Skill Bundle。

它要解决的不是“替用户写一份更长的 Prompt”，而是把原本需要 Prompt Engineering、Agent Workflow、Tool/MCP、资源组织和 Eval 经验的工作，变成一条普通用户也能完成的产品流程。

## 项目要解决什么问题

创建一个能长期复用的 Skill，通常会遇到四类困难：

- 用户知道自己想要什么结果，却说不清完整的输入、分支、边界和验收标准。
- 模型容易把推断、行业惯例和生成器默认值写成用户的硬要求。
- `SKILL.md`、参考资料、工具契约和 Eval 分别生成后，内容可能互相矛盾。
- “看起来完整”不等于“实际有效”，修改后的候选版本也可能让原有能力退化。

SkillCanvas 把这些问题分别交给引导式交互、Canonical SkillIR、Build Loop 和 Optimization Loop。用户负责确认目标与偏好，系统负责把确认结果编译成可运行结构，并用证据决定候选版本能否替换当前版本。

## 产品原则

1. **一句话也能开始**：先做一个可判断的结果，再围绕真实差距追问，不要求新手先写完整需求文档。
2. **用户输入优先**：每条 Requirement 都保留来源。生成器默认值不能自动升级为 `MUST`、`NEVER`、`ONLY` 或拒绝规则。
3. **能力按必要性加入**：Reference、Script、Asset、Host Tool、MCP 和 State 都要说明为什么存在；裸模型已经可靠时不机械增加资源。
4. **语义只走一条提交路径**：运行语义先写入 Canonical SkillIR，再统一投影到所有文件；脚本和资产才允许文件级修改。
5. **候选版本用证据晋级**：评测、评分、优化和个性化互相隔离。没有 held-out 提升或出现回归时，系统保留旧版本。
6. **不伪装运行能力**：未安装的 MCP、宿主没有暴露的 Tool、未实际执行的脚本，都不能被描述成“已经成功调用”。

## 从用户视角看 Workflow

产品主流程分为六步。前面的选择会进入后续蓝图、能力规划、Eval 和 Demo，不是只影响当前页面的问卷。

| 阶段 | 用户看到什么 | 系统在做什么 | 阶段产物 |
| --- | --- | --- | --- |
| 1. 描述需求 | 输入一句目标，上传 PDF 或补充参考 | 解析资料、识别直接标识、生成代表性任务 | 初始 Goal、来源证据、理解预演输入 |
| 2. 预演理解 | 先看 AI 做一次，再选择哪里不够懂 | 根据预演偏差生成最多四轮动态问题，补齐真正影响结果的决定 | 16 个需求维度中的有效证据 |
| 3. 确认工作方式 | 查看并编辑目标、输入、流程、边界、输出和测试 | 编译 Requirement、Capability、Loop、State 与 Output Contract | 经用户确认的生成蓝图 |
| 4. 生成并优化 | 查看 Build Loop 与 Optimization Loop 的真实状态 | 研究领域知识、生成 Bundle、修复契约、冻结 Eval、试跑与回滚 | 当前最佳 Skill Bundle |
| 5. 验证效果 | 用一个真实任务运行 Skill Demo，可继续对话 | 执行当前 Skill、找出可见偏差，把反馈转成 Canonical Mutation 后回归验证 | 经验证的个性化候选版本 |
| 6. 保存并使用 | 编辑所有文件、查看用途并下载 ZIP | 发布前检查、隐私处理、Bundle 打包 | 可安装到目标 Agent 的 Skill 包 |

### 为什么先做 Demo，再问问题

对新手直接提问“需要什么工作流、失败模式和协作边界”，通常只能得到猜测。SkillCanvas 会先根据目标和资料生成一段具体结果，让用户对着真实输出判断：哪些信息被忽略、哪些表达不像自己、AI 应该多主动、哪里必须确认。

访谈问题由当前 Goal、资料、前序回答和 Demo 偏差共同生成。四轮分别聚焦目标与价值、工作方式、个性与边界、真实使用校准；系统只补会改变 Skill 行为的决定，不为填满问卷而追问。

## 系统内部 Workflow

```text
一句话目标 + 上传资料 + Demo 反馈
                 │
                 ▼
      Requirement Evidence & Provenance
                 │
        ┌────────┴────────┐
        ▼                 ▼
Information Dependency   Knowledge Research
输入从哪来、缺少时怎么办   搜索、来源分级、规则蒸馏
        └────────┬────────┘
                 ▼
 Capability Necessity + Output/State/Tool Contract
                 │
                 ▼
          Canonical SkillIR
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼
   SKILL.md   references   Eval / Tool / State
      └──────────┬──────────┘
                 ▼
             BUILD LOOP
       P0 执行门禁 → P1 契约门禁
                 │
                 ▼
        冻结 SkillIR 与 Eval Contract
                 │
                 ▼
          OPTIMIZATION LOOP
  无 Skill 基线 → 候选执行 → 隔离评分 → held-out
                 │
          ┌──────┴──────┐
          ▼             ▼
       接受候选       回滚并保留最佳版
          │
          ▼
     Demo / 用户反馈 / 个性化回归
```

## Canonical SkillIR：语义单一真源

`app/skill-ir.ts` 定义了 SkillCanvas 的 Canonical SkillIR。它不是另一个展示文件，而是所有运行语义的唯一编译输入，主要包含：

- Identity：Skill 名称、稳定 Goal、意图与触发描述。
- Requirement：规则正文、来源、置信度、强度、失败成本和映射能力。
- Task：触发条件、必需/可选输入、输出、能力与成功指标。
- Capability：LLM、Reference、Script、Asset、Builtin Tool、MCP、Eval 的必要性和实现归属。
- Input Dependency：输入来源、构建时是否可用、缺失处理方式、是否允许推断。
- Output Contract：人类文本、机器结构或真实文件，以及对应验证方式。
- State Contract：是否需要状态、保存范围、字段、更新、更正、过期与隐私边界。
- Risk Branch：条件、处理动作和停止/转向规则。
- Evaluation Plan：触发、核心能力、Grounding、Integration 和失败模式用例。
- Traceability：`Requirement → Capability → Implementation → Eval` 的映射。

Canonical IR 会确定性投影为：

```text
evals/skill-ir.json
        ├── SKILL.md
        ├── agents/openai.yaml
        ├── evals/capability-manifest.json
        ├── evals/evals.json
        ├── references/output-contract.md
        ├── references/state-model.md
        ├── references/loop-plan.md
        ├── references/domain-playbook.md
        └── integrations/tool-contracts.json
```

语义修复、Optimization 和 Demo 个性化都要先生成 `CanonicalMutation`，经 `applySkillIRMutations()` 校验后重新投影。文件级 Patch 只保留给 `scripts/**` 和 `assets/**` 这类实现字节，避免模型直接修改 `SKILL.md` 后又被旧 IR 覆盖。

## Requirement 与权限一致性

每条 Requirement 都带有 Provenance：

- `user_explicit`：用户直接确认。
- `user_example`：从用户认可的示例中提取。
- `source_grounded`：由可追溯资料支持。
- `domain_inferred`：领域推断，需要较弱规则强度。
- `generator_default`：生成器默认值，不能自动成为硬约束。

`app/evidence-gates.ts` 还会建立 Information Dependency：每个输出字段需要什么来源、当前是否可用、是否允许生成、缺失时应该追问、标注、跳过还是继续。用户明确允许润色、补写或自由创作时，该权限会同时进入 SkillIR、Runtime、Domain Playbook、Eval 和 Grader；验证器不能再额外塞入一条相反的“禁止生成”默认规则。

## 专业知识 Workflow

联网能力用于补充 Skill 执行所需的领域判断，不是给生成器堆搜索结果，也不是让生成后的 Skill 默认联网。

```text
识别知识缺口
    ↓
生成检索问题
    ↓
Firecrawl / SearXNG 获取公开来源
    ↓
来源去重、Authority Ranking、时间与可追溯性检查
    ↓
蒸馏为带条件的 Knowledge Atom
    ↓
覆盖率、价值密度、冲突和权限检查
    ↓
写入 Canonical IR 与 references/domain-playbook.md
```

Knowledge Atom 会区分官方规则、证据支持的实践、用户偏好、启发式经验和模型直觉。来源权威性与 Confidence 会影响 Runtime 强度：权威且高置信的规则可以成为约束，二手经验默认只能作为条件建议，不能因为措辞肯定就升级为 Mandatory。

前端会展示检索重点、来源数量、采用规则和未采用原因。若没有形成可追溯且能改变决策的知识，系统保留知识缺口，但不会把模型常识伪装成“联网研究结果”。

## Capability 与 Tool/MCP 规划

Capability Planner 在加入能力前检查五件事：

1. 这项能力是否明显提高成功率。
2. 裸模型是否已经能稳定完成。
3. 是否存在适合确定性处理的计算或文件转换。
4. 是否有真实 Reference、Script 或 Asset 可用。
5. 是否依赖宿主 Tool 或外部 MCP。

支持的 Capability Kind：

| Kind | 用途 | 生成规则 |
| --- | --- | --- |
| `llm` | 语义理解、判断、改写和规划 | 写入 Runtime Workflow |
| `reference` | 按条件读取的专业资料、规则或用户范式 | 必须有真实路径和路由条件 |
| `script` | 确定性计算、结构转换、批处理 | 必须生成脚本、CLI 契约和独立测试 |
| `asset` | 会被复制、填写、转换或交付的模板资产 | 不能用隐藏说明冒充 Asset |
| `builtin-tool` | 目标 Agent 提供的文件、终端、搜索、浏览器等能力 | 运行前验证可用性，并提供不可用分支 |
| `mcp` | GitHub、知识库、协作工具等命名外部服务 | 需要具体 Server、安装和授权确认 |
| `eval` | 核心能力、触发、Grounding 和 Integration 回归 | 每个激活能力至少有对应证据 |

SkillCanvas 不会在 Skill 包里“安装” MCP。未配置的 MCP 只能生成 setup、availability 与 fallback 契约，不能计为执行成功。对已经由用户注册并授权的 MCP Server，服务端 Runtime Adapter 可以执行真实的 Tool Discovery 与 Tool Call。

### MCP Runtime Adapter

`app/mcp-runtime.ts` 和 `/api/mcp` 实现了一条独立于 Skill 文案的真实运行链路：

```text
register connection
  → discover tools
  → verify authorization
  → call tool
  → input_required / approval_required
  → persist checkpoint
  → resume original request
  → verify result
  → append trace
```

- 使用官方 MCP TypeScript Client 和 Streamable HTTP Transport，不用自定义 JSON 假装 MCP。
- 生产连接要求 HTTPS；本地开发只放行 loopback HTTP。
- Bearer Token 加密保存在服务端凭据存储，前端连接列表不返回 Token。
- Tool 可以返回 `input_required`。Runtime 保存原始 `requestState` 和 Workflow Checkpoint，取得用户补充输入后恢复同一调用。
- 未授权时进入 `approval_required`，不会把鉴权失败误写成 Tool 不可用。
- 调用结果必须通过非错误、非空内容检查，之后才把 Workflow 标记为完成。

### 生成器内部的 MCP Evidence Router

MCP 不只会被规划进最终 Skill。`app/internal-mcp-evidence.ts` 还把用户已经授权的只读 MCP Tool 接入生成器自身的两条证据链：

1. **Knowledge Compiler**：根据 Knowledge Plan 的具体 Query 自动发现只读 Search/Read/Retrieve Tool，构造参数并取回可追溯证据；若网页搜索也已配置，则合并两类来源后再蒸馏 Knowledge Atom。
2. **Optimization Research**：先由 Critic 从真实失败和低知识密度中定位具体 Knowledge Gap，只有证据不足时才调用 MCP；取回内容后重新做一次 Critic 判断，再把蒸馏结果交给 Canonical Mutation Planner。

Router 会拒绝名称或描述中带有写入、发送、删除、发布等副作用的 Tool。需要额外输入或授权的调用只记录 Trace 并安全跳过，不会在后台替用户确认。每份 MCP 证据都保留 `connectionId / toolName / runId`，因此可以从 Knowledge Atom 或优化决策追溯到 Durable Workflow。没有可用 MCP 时，两条流程会继续使用网页来源或按“无来源知识”安全降级，不阻塞通用 Skill 生成。

`/api/mcp/conformance` 是本地协议测试 Server，用来验证多轮调用；它不是产品业务 Tool。

## Build Loop：先证明结构可执行，再冻结架构

Build Loop 负责从确认后的蓝图生成并冻结初始 Bundle：

```text
用户意图
  → 任务样例
  → Skill 契约
  → 能力图
  → Capability Delta（裸模型会什么 / Skill 必须额外教什么）
  → 专业知识编译
  → 产物计划
  → 生成 Bundle
  → 冻结架构
```

Capability Delta 先删除裸模型已经能稳定完成的通用理解、改写与规划，只保留会改变运行决策、失败恢复、边界处理或验收方式的能力差值。Domain Knowledge 随后只围绕这些差值采集四类证据：Decision Rules、Failure Modes、Edge Cases、Verification Methods。任一必需类别没有证据时，Skill 会被明确标记为知识不足，不会用泛化“最佳实践”补齐篇幅。

运行 Workflow 不是文字步骤列表。每个 Step 必须声明 `requires[] / produces[] / mutates[]`；编译器根据产物依赖执行拓扑排序，并在 Bundle 生成前拦截未满足依赖、重复 Producer 和循环依赖。

Build Gate 把“检测方式”和“问题级别”分开：确定性检查不等于 P0。

### P0 Execution Gate

P0 只处理会阻止 Bundle 加载或执行的问题，例如：

- 非法或越界路径。
- 必需文件缺失或为空。
- Frontmatter、JSON、YAML、Schema 无法解析。
- Python/Shell 语法错误。
- Runner 无法启动或独立脚本测试失败。

P0 Repair 只修改执行层阻断问题，不借机重写用户语义。

### P1 Contract Gate

P1 处理可确定性发现的语义契约问题，例如：

- 用户权限与 Runtime/Grader 冲突。
- Description 承诺了 Workflow 没有实现的任务。
- Required Input 没有进入 Task 与缺失处理分支。
- Output 声明文件交付，却没有 Producer 或 Artifact Pattern。
- Capability 有实现但没有路由、Eval 或 Tool Contract。
- 相邻重复句、模板占位符、泛化输入重叠和跨文件投影漂移。

只有 P0 与 P1 都清空，Build Loop 才会冻结 SkillIR 和 Eval。若自动修复在预算内没有收敛，系统保留问题和最佳候选，不会把失败状态包装成“已通过”。

## Optimization Loop：有证据才替换当前版本

Optimization Loop 不再修改用户 Goal，也不接受“模型觉得更好”这种自评。它在冻结契约上执行十个节点：

```text
冻结评测
  → 隔离执行
  → 隔离评分
  → 无 Skill 基线
  → 问题诊断
  → 有限修改
  → 匿名 A/B
  → 保留集回归
  → 保留任务
  → 精简冗余
```

## Durable Workflow Runtime

`app/workflow-runtime.ts` 把长任务状态从 React 页面状态中抽成服务端持久化状态机。Build、Optimization 与 MCP Call 共用相同的运行语义：

- 每个 Run 保存 `kind / status / currentNode / input / output / error / version`。
- 每个 Node 保存顺序、输入、输出、尝试次数、重试上限和当前状态。
- 每次 claim、complete、fail、interrupt、resume 都先写 Checkpoint，再追加 Runtime Trace。
- 节点失败时只在自己的 Retry Budget 内回到 pending；用尽预算后 Run 才进入 failed。
- `input_required` 与 `approval_required` 是可恢复中断，不是异常字符串。
- Run、Node、Checkpoint、Trace 和 MCP Connection 全部按 Tenant 查询和写入。

标准节点计划：

```text
Build:
intent → representative-task → contract → capability-plan
       → capability-delta → knowledge-compile → bundle → freeze

Optimization:
held-out-split → baseline → execute → grade → diagnose
               → mutate → regression → commit
```

`/api/workflows` 暴露 `start / claim / complete / fail / interrupt / resume`，使 Worker 或 UI 可以在进程重启后从最新 Checkpoint 继续，而不是从第一步重新生成。当前第一阶段已经把 Runtime Kernel、D1 Schema、API 与 MCP 多轮调用接通；原有超大页面中的 Build/Optimization 业务处理器会按节点逐步迁入这个 Runtime，避免一次性重写导致现有生成流程回归。

### 1. 生成真实 Eval Bank

单个 Skill 生成约 10–20 个自包含用例，覆盖四个 Family：

- Trigger：显式触发、隐式触发、带上下文触发和相邻 Hard Negative。
- Capability：核心任务、重要分支和失败恢复。
- Grounding：资料使用、权限、未知信息和状态边界。
- Integration：激活的 Tool、MCP、Script、Asset 与 Artifact 行为。

Eval 会按 Capability 分层切分为 `train / selection / test`。每个激活能力至少进入一个 held-out Case，防止稀疏的文件或工具能力在抽样时被漏掉。

### 2. 执行与评分上下文隔离

Executor 只看到 Runtime Bundle 与公开任务输入，看不到隐藏断言、Grader 或 Capability Manifest。执行完成后，Grader 在另一段 Prompt 上下文中读取冻结契约与结果，不能改写答案。

这是 **execution/grading context isolation**。二者可能仍由同一个 Provider/Model 提供，因此项目不宣称“多模型裁判”。

### 3. 比较无 Skill 与有 Skill

每个冻结 Case 会比较：

- `without_skill`：通用模型基线。
- `with_skill`：当前最佳 Skill。
- `candidate`：本轮 Canonical Mutation 后的候选。

报告保留均值、标准差、通过率、耗时、输出长度和重复运行波动，避免一次偶然高分决定版本晋级。匿名 A/B 不暴露版本身份。

### 4. Textual Gradient 与定向修复

Grader 除了分数和 Issue，还会返回：

- `textualFeedback`：最关键的共性问题、为什么失败、应该朝什么方向修。
- `failedCases`：失败 Case、实际证据和受影响 Capability。
- `preserve`：下一轮不能破坏的已有行为。

Optimizer 只消费 Train 证据提出有限数量的 Canonical Mutation；held-out 原文不会泄漏给修改 Agent。修改预算相当于 Textual Learning Rate，用来限制为了某个 Case 写特判。

每条未通过的 Eval Case 会先经过 Failure Attribution，再进入 Patch Planner。归因不是一个仅供展示的标签，而是编译器级修改边界：

| 失败类型 | 只允许修改的 Canonical 区域 | 典型修复 |
| --- | --- | --- |
| 缺决策规则 | `domainEvidence` | 增加或收窄一个带适用条件的 Decision Rule |
| 缺例外 | `riskBranches` | 增加边界、Fallback 或停止/转向条件 |
| 缺工具知识 | 被归因的 `capability` | 修正可用性、参数、调用回执或降级行为 |
| 缺验证 | `outputs` / `evaluationPlan` | 增加可观察的完成检查或 Eval 断言 |
| instruction 冲突 | `requirements` / `constraints` | 删除或收窄相互矛盾的指令 |

归因后的失败不能提交整包文件替换，也不能顺手修改其他语义区域。新增 Decision Rule 还必须保留外部 `source_urls` 或失败训练用例的 `eval_case_ids`；`references/domain-playbook.md` 会把这条来源投影出来。Planner 若越界，Patch 会在候选执行前被拒绝。这样“反哺 Skill”是对缺失节点的局部学习，不是把同一份 Skill 重新生成一遍。

### 5. One Commit Path、回滚与决策账本

候选只有在以下条件成立时才能替换当前版本：

- held-out 目标分严格提升，或在 Preserve 模式下满足新增要求且不退化。
- Capability Closure 不下降。
- P0/P1 Blocker 没有增加。
- 通过旧版本已经通过的保留任务。
- 匿名比较没有稳定偏向旧版本。

Optimization 与 Demo 个性化都走同一条 `Canonical Mutation → Validate → Project → Regression → Commit/Rollback` 路径。`evals/decision-ledger.json` 记录候选为什么被接受或回滚、消费了哪一轮文本反馈、改变了哪些内容以及对应证据摘要。下一轮可以读取失败历史，避免重复提交已经证明无效的修改。

最后的 Minimality Pass 会删除空 Integrations、孤立 Reference、假 Artifact、重复规则和没有消费者的资源。目标不是压缩字数，而是让每个文件和能力都能解释其存在理由。

## 三种“通过”不是同一件事

| 阶段 | 证据类型 | “通过”的含义 |
| --- | --- | --- |
| Build Gate | 本地确定性检查 | Bundle 能加载、契约自洽、跨文件投影一致 |
| Optimization Gate | 模型执行 + 隔离评分 + held-out/回归证据 | 候选在冻结任务上稳定优于或安全满足当前版本 |
| Demo | 一次真实任务执行 | 当前 Skill 对这个具体输入产生了可供用户判断的结果 |

状态机保留 Evidence Strength、样本量和策略版本，不把三种结果压成同一个没有上下文的 `pass/fail`。

## Demo 与个性化 Loop

正式 Eval 结束后，系统选择一个代表性任务生成用户可见 Demo。用户可以继续对话，也可以选择“哪里还不够懂你”。反馈会先转成新的 Requirement、Input、Constraint、Capability 或 State Mutation，再生成下一版 Demo。

个性化候选必须重新通过既有回归任务，避免“更像用户”却悄悄破坏已经验证的触发、工具或输出能力。只有通过后才原子提交到当前 Bundle。

## 生成的 Bundle

不同 Skill 会按必要性生成不同文件，典型结构如下：

```text
generated-skill/
├── SKILL.md                         # Agent 运行入口
├── agents/
│   └── openai.yaml                 # 展示名称、简介与默认触发 Prompt
├── references/
│   ├── domain-playbook.md          # 按条件加载的专业判断规则
│   ├── source-evidence.md           # 匿名化、可追溯的用户资料特征
│   ├── loop-plan.md                # 适用时的循环与停止契约
│   ├── state-model.md              # 适用时的状态字段和更正规则
│   ├── output-contract.md          # 输出结构、文件模式和验证方式
│   └── tooling.md                  # Tool/MCP 路由说明
├── integrations/
│   ├── tool-contracts.json         # 可用性、输入、输出与 fallback
│   └── mcp-setup.md                # 用户确认过的 MCP 安装回执
├── scripts/                         # 只有确定性处理确有价值时生成
├── assets/                          # 只有交付流程会使用时生成
└── evals/
    ├── skill-ir.json               # Canonical SkillIR
    ├── capability-manifest.json    # 能力闭环与追溯关系
    ├── evals.json                  # 真实任务与 Hard Negative
    ├── graders.json                # 分层评分契约
    ├── result.schema.json          # 评测结果结构
    ├── run_evals.py                # 可移植 Eval Runner
    ├── artifact_checker.py         # 真实文件检查
    ├── decision-ledger.json        # 候选接受/回滚证据
    └── script-tests/               # 生成脚本的独立测试
```

空 Reference、未声明 Asset、未配置 Tool/MCP 和没有消费者的文件不会为了目录完整而生成。

## 工程模块

| 模块 | 职责 |
| --- | --- |
| `app/page.tsx` | 当前前端状态与 Agent Orchestration 主入口，串联创建、Build、Optimization、Demo 和发布 |
| `app/workflow-state.ts` | 六阶段状态机、需求维度和用户可见 Provenance 校正 |
| `app/skill-ir.ts` | Canonical SkillIR、确定性 Projector、Traceability 与跨层审计 |
| `app/canonical-mutations.ts` | Requirement/Task/Capability/Input/Output/State 等原子语义变更 |
| `app/evidence-gates.ts` | Requirement Provenance、内容权限、Information Dependency、Scope 与 Minimality Gate |
| `app/bundle-validator.ts` | P0 Execution 与 P1 Contract 的确定性分类和检查 |
| `app/knowledge-research.ts` | 知识缺口、Authority Ranking、Knowledge Atom、覆盖率和价值密度 |
| `app/optimizer-core.ts` | Capability 分层抽样、Textual Gradient、候选 Gate 与保留任务 |
| `app/real-eval-harness.ts` | 冻结 Eval、Runtime Context、重复执行、隔离评分、基线和匿名比较 |
| `app/gate-outcome.ts` | Build、Optimization、Demo 三类 Gate 的证据强度与状态表达 |
| `app/decision-ledger.ts` | 候选接受/回滚原因和已消费反馈的持久账本 |
| `app/eval-workflow-service.ts` | 本地 Sandbox 请求、Artifact 与脚本测试结果归一化 |
| `scripts/skill-sandbox-server.mjs` | 临时文件落盘、文件模式检查和 macOS Seatbelt 禁网脚本测试 |
| `app/server-data.ts` | D1 会话、加密凭据、诊断日志、Token 与可选成本估算 |

## API 与数据流

- `POST /api/ai`：统一承载 Preview、Interview、Blueprint、Build、Repair、Eval、Optimize、Demo 和 Personalize 模式。
- `POST /api/research`：调用 Firecrawl 或 SearXNG，返回受来源策略约束的研究结果。
- `POST /api/parse-pdf`：提取 PDF 文本并生成页码级证据。
- `POST /api/validate-bundle`：执行服务端 Bundle 验证。
- `POST /api/download`：生成最终 ZIP。
- `GET/POST/DELETE /api/credentials`：读取状态、加密保存或清除模型与研究凭据。
- `GET/POST /api/client-log`：写入和读取不含正文的诊断事件。

## 本地启动

要求：

- Node.js `>=22.13.0`
- pnpm
- 若需要运行生成的 Python Script Test：macOS 自带 `sandbox-exec` 与可用的 `python3`

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动：

- Web：`http://localhost:3000`
- 本地评测 Sandbox：`http://127.0.0.1:4318`

第一次本地启动会在被 Git 忽略的 `.wrangler/skillcanvas-vault-key` 生成凭据加密密钥。D1 数据、加密凭据和诊断日志保存在项目本地 Wrangler 状态中。

进入页面后，在模型设置中选择 DeepSeek、OpenAI 或 OpenAI-Compatible 接口并保存 API Key。联网知识研究为可选能力，可连接 Firecrawl 或自部署 SearXNG。

浏览器通知只在用户点击“确认理解并生成 Skill”后请求授权；允许后，长时间 Build/Optimization 完成、暂停或失败时自动通知，不影响未授权用户继续生成。

## 环境变量

| 变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `SKILLCANVAS_CREDENTIAL_SECRET` | 生产必需 | AES-GCM 凭据加密主密钥；本地缺省时自动生成项目级随机密钥 |
| `SKILLCANVAS_MODEL_PRICING_JSON` | 可选 | 按模型配置输入/输出 Token 成本估算 |
| `SKILLCANVAS_SANDBOX_PORT` | 可选 | 本地 Sandbox 端口，默认 `4318` |

成本配置示例，单价为 USD / 1M tokens：

```json
{
  "your-model-id": {
    "inputUsdPerMillion": 0,
    "outputUsdPerMillion": 0
  }
}
```

模型 API Key、Firecrawl Key 和 SearXNG 地址通过页面设置保存，不应写入源码或提交到 Git。

## 安全与可观测性

- API Key 不写入 `localStorage`、生成的 Skill、Prompt 日志或仓库。
- 凭据经 AES-GCM 加密后写入 D1；浏览器只保留 HttpOnly 会话标识。
- AI、联网研究、凭据和前端日志接口都有请求频率限制。
- 诊断记录 Mode、耗时、状态、Request ID、Token 与可选成本，不记录 Prompt、上传文件正文、模型完整输出或 Key。
- 下载默认匿名化常见手机号、邮箱、证件号和密钥；导出原始敏感内容需要用户主动确认。
- Runtime Reference 只保留执行 Agent 真正需要的内容，构建期蓝图、评分解释和内部诊断不会混入运行上下文。

## 本地 Sandbox 与能力边界

当前实现不是完整的通用 Agent Sandbox Runtime：

- **真实执行**：模型任务、临时文件系统写入、Artifact Pattern 检查和生成 Python 测试的受限进程运行。
- **真实隔离**：Executor 与 Grader 使用分离 Prompt Context；可能仍是同一个 Provider/Model。
- **网络限制**：macOS Script Test 使用 Seatbelt 禁止网络，仅允许在临时工作区写文件。
- **Tool/MCP 边界**：MCP Runtime 已支持已注册 Server 的真实 discovery、authorization、call、`input_required`、resume、verify 和 trace；Eval Harness 尚未自动执行任意第三方 MCP。未连接的宿主 Tool/MCP 仍只检查契约与 fallback，不算调用成功。
- **平台限制**：受限 Python 进程目前只为 macOS Seatbelt 实现；其他平台返回 `not_available`，不会伪报通过。

## 验证命令

```bash
pnpm lint
pnpm test
pnpm db:generate
pnpm test:workflow-runtime
# 先启动本地服务，再执行：
pnpm test:mcp-runtime
```

`pnpm test` 会先执行生产构建，再运行 `tests/*.test.mjs`。测试覆盖 SkillIR 投影、Bundle Gate、Knowledge Compiler、Eval 分层、Sandbox、Decision Ledger、Personalization、Workflow State 和发布契约。

## 当前技术债务

- `app/page.tsx` 仍承担部分 Build/Optimization 业务处理器。Durable Workflow Kernel 与 API 已落地，下一阶段是把现有节点处理器逐个迁到服务端 Worker，而不是重新设计一套状态语义。
- 生产多租户需要接入正式身份系统、稳定 D1/R2 资源、租户级预算和更细的成本告警。
- MCP Runtime 已有通用 Streamable HTTP Adapter；OAuth 动态注册、第三方 Server 白名单、租户级 Egress Policy 和 Eval Harness 自动调用仍需继续补齐。
- Eval 能降低回归风险，但不能证明 Skill 在所有真实任务中都优于通用模型；前端会保留样本量、波动和证据强度。

## 设计借鉴

项目吸收了以下方向的工作方式，但代码和产品流程均针对 SkillCanvas 重新实现：

- Anthropic Skill Creator：从真实任务生成 Eval、对比有/无 Skill、根据失败证据迭代。
- Microsoft SkillOpt：在文本空间中执行 rollout、reflection、bounded update 与 held-out gate。
- TextGrad：把完整文字批评作为下一轮优化输入，而不是只保留一个标量分数。

SkillCanvas 在此基础上增加了面向新手的 Demo-first 访谈、Requirement Provenance、Canonical SkillIR、Capability Necessity、知识来源分级、P0/P1 双门禁、One Commit Path、Decision Ledger 和可编辑 Bundle 交付。
