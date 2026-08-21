# SkillCanvas

面向小白用户的通用 AI Skill 生成器：从一句模糊目标开始，通过引导式访谈、证据化专业知识研究、Capability 编译、双 Loop 优化和真实 Demo 反馈，生成可编辑、可评测、可导出的 Skill Bundle。

## 本地启动

要求 Node.js `>=22.13.0` 与 pnpm。

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动：

- Web 应用：`http://localhost:3000`
- 本地评测沙箱：`http://127.0.0.1:4318`

本地开发第一次启动会在被 Git 忽略的 `.wrangler/skillcanvas-vault-key` 生成凭据加密密钥；D1 数据、加密凭据和诊断日志保存在项目本地的 Wrangler 状态中。API Key 不写入 `localStorage`、源码、生成 Skill 或日志。

## 核心架构

```text
一句话目标 / 上传资料
        ↓
Discovery Preview + 4 轮自适应访谈
        ↓
Requirement Provenance / Information Dependency
        ↓
专业知识 Research → Authority Ranking → Knowledge Compiler
        ↓
Capability / Tool / State / Output Contract 编译
        ↓
BUILD LOOP：静态门禁 → 语义闭环 → 自动定向修复 → 冻结 SkillIR
        ↓
OPTIMIZATION LOOP：分层 Eval → 隔离执行/评分 → Patch → Held-out Gate → 回滚/保留
        ↓
真实 Demo → 用户可见偏差 → 定向个性化迭代 → 导出 Bundle
```

主要工程模块：

- `app/skill-ir.ts`：Canonical SkillIR、需求到输入/能力/工作流/输出的编译与跨层一致性。
- `app/evidence-gates.ts`：requirement provenance、内容权限、information dependency、hard negative 与 minimality gate。
- `app/knowledge-research.ts`：来源 authority ranking、领域规则蒸馏、覆盖率与价值密度门禁。
- `app/optimizer-core.ts`：按 Capability 分层的 train / selection / untouched test 切分。
- `app/real-eval-harness.ts`：冻结 Eval、执行/评分上下文隔离、重复试跑、基线和匿名 A/B。
- `app/eval-workflow-service.ts` + `scripts/skill-sandbox-server.mjs`：文件真实落盘、artifact 检查与 macOS 禁网进程脚本测试。
- `app/server-data.ts`：按用户或 HttpOnly 本地会话隔离的加密凭据、D1 诊断与 token/成本观测。

## 评测能力边界

当前不是“完整通用 Agent Sandbox Runtime”：

- 已真实执行：模型任务、临时文件系统写入与检查、生成 Python 测试的受限进程运行。
- 已隔离：Executor 和 Grader 使用分离 Prompt 上下文；它们可能仍使用同一 Provider/Model，因此不宣称“多模型裁判”。
- 未伪装执行：没有配置真实 adapter 的宿主 Tools/MCP 只验证契约与 fallback，不计为真实调用成功。

## 安全与可观测性

- 凭据经 AES-GCM 加密后写入 D1；浏览器只保留 HttpOnly 会话标识。
- AI、联网研究、凭据与前端日志接口均有请求频率限制。
- 诊断只记录模式、耗时、状态、token 与可选成本，不记录 Prompt、文件正文、模型输出或 Key。
- `SKILLCANVAS_MODEL_PRICING_JSON` 可配置不同模型的成本估算（单价为 USD / 1M tokens）：

```json
{
  "your-model-id": {
    "inputUsdPerMillion": 0,
    "outputUsdPerMillion": 0
  }
}
```

生产环境必须配置稳定的 `SKILLCANVAS_CREDENTIAL_SECRET`，并使用平台身份头或正式身份系统；本地模式使用不可读的 HttpOnly 随机会话隔离单机用户。

## 验证命令

```bash
pnpm lint
pnpm test
pnpm db:generate
```
