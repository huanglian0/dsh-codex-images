# DSH Codex Images

作者：lalala.gpt

AI 协作：[OpenAI Codex](https://openai.com/codex/)（代码审阅、文档整理与开源发布）。

复用 DSH 已有的 ChatGPT / Codex 登录，在对话里完成单张图片生成和编辑。

这是 DSH Native Images 系列中的 GPT 图片插件：把图片能力作为独立工具接入 DeepSeek Harness，不新增聊天模型，也不需要另外填写 API Key。你可以继续使用自己的对话流程，在明确需要图片时调用它。

## 核心特点

- 复用原生账号：读取 DSH 已有的 ChatGPT / Codex 登录，通过宿主凭据服务处理必要的登录刷新，无需复制登录文件。
- 对话里完成交付：生成或编辑的图片显示在当轮回复下方，可点击放大，另附未缩放原图文件卡，方便保存和继续编辑。
- 参数明确：提供质量、尺寸和背景选项，支持请求透明背景。
- 已有图片直接展示：独立的 codex_image_show_saved 工具只展示指定本地图，不重新生成、不读取或刷新登录。
- 行为可控：生成和编辑默认关闭；启用后每次只处理一张，失败不自动重试，也不自动切换其他服务或认证方式。

## 适合谁，如何选择

适合已经在 DSH 登录 ChatGPT / Codex，希望通过自然语言生成一张图、修改一张指定图片，或重新展示已有图片的用户。GPT 和 Grok 插件彼此独立，可以只安装需要的一个。

如果你需要无限画布、批量创作、多模型工作台或独立图库管理，可以参考覆盖这些流程的 [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) 和 [dsh-imagegen](https://github.com/dickpy/dsh-imagegen)，按自己的创作方式选择。

需要使用现有 xAI 登录出图时，可选择同系列的 [DSH Grok Images](https://github.com/lalala-git/dsh-grok-images)。

## 接入方式

出图通过 `https://chatgpt.com/backend-api/codex` 图片通道使用 `gpt-image-2`。这是 Codex 订阅通道，不是公开 API Key 接口。本插件不是 OpenAI 官方发布的插件；它依赖 DSH 的原生服务和 Codex 图片协议，相关接口变化可能导致插件失效。

GitHub 项目名为 DSH Codex Images；安装用的包名仍为 `dsh-plugin-gpt-codex-images`。

## 工具与图片展示

插件加载后注册以下四个工具；关闭图片请求开关时，状态检查和已有图片展示仍可使用。

- `codex_image_status`：无参数。只读取本机原生登录记录及插件开关状态，不联网、不刷新登录、不发送图片请求。
- `codex_image_generate`：根据 `prompt` 生成一张图片，需启用图片请求。
- `codex_image_edit`：根据 `prompt` 编辑 `image_path` 指定的一张本地图，只上传所选图片，需启用图片请求。
- `codex_image_show_saved`：展示 `image_path` 指定的已有本地图，不生成、不编辑、不读取或刷新登录，也不调用图片 API。

生成和编辑共用以下参数：

- `prompt`：必填，非空提示词，1–16000 个字符。
- `quality`：`auto`、`low`、`medium`、`high`；默认 `auto`。
- `size`：`auto`、`1024x1024`、`1536x1024`、`1024x1536`；默认 `auto`。
- `background`：`auto`、`opaque`、`transparent`；默认 `auto`，透明背景使用 `transparent`。

编辑和已有图片展示另需 `image_path`，指向用户指定且 DSH 沙盒可读取的本地 PNG、JPEG 或 WebP 文件。输入上限为 20 MiB，同时受 DSH 自身可能更小的图片大小限制约束。

每次只生成或编辑一张，插件同时只接受一个生成或编辑任务。成功结果通过 DSH 原生图片画廊显示在当轮回复下方，可点击放大；已有图片展示也使用该画廊。预览可能被 DSH 缩放，另附的原图文件卡保留未缩放的原始图片文件，可用于后续编辑。图片和原图存入当前 DSH 的原生附件库，不必再次生成或重复调用 `present`。

状态检查成功只说明本机登录记录可读取，不代表已验证出图权限、剩余额度或实际计费方式。返回的套餐提示或本进程历史成功标记也不能代替这些检查；已有图片展示成功同样不能证明出图能力。

## 环境要求与已验证范围

- 已验证范围：Windows 桌面版 DeepSeek Harness `0.2.1-rc.2`。其他系统、版本及独立浏览器部署未在此范围内验证。
- 版本要求以本插件的 [package.json](./package.json) 中 `engines` 为准；当前为 Node.js `>=22`、DSH `>=0.2.1-rc.2`。最低版本声明不等于所有后续版本均已验证。
- 需要完整 DSH 桌面安装目录中的 `resources\app.asar`、当前实例的原生凭据服务和附件服务。
- 生成、编辑及必要的登录刷新需要联网；状态检查与已有图片展示无需调用图片服务。

## 安装到目标 profile

先获取本项目源码：在仓库页面选择 Code → Download ZIP 并解压到固定目录，或执行：

```powershell
git clone https://github.com/lalala-git/dsh-codex-images.git
```

安装时选择包含 package.json、src 和 cordis.patch.yml 的插件目录。下面的本地路径均是占位示例，按你的保存位置替换。

先确认 DSH 当前使用的是要安装插件的目标 profile。profile 是 DSH 的配置与依赖目录，不是程序安装目录，也不等同于数据目录；不要根据窗口名称猜测目录或把桌面 profile 当作普通 CLI profile。

推荐在该 profile 的 DSH 中打开「Plugins／插件」→「Add plugin／添加插件」，输入本地插件目录的绝对路径，例如 `C:\Path\To\plugins\gpt-codex-images`。该目录应包含本插件的 `package.json`、`src` 和 `cordis.patch.yml`。第三方插件安装后可能仍处于关闭状态；完成下节的 profile 配置后，在插件页启用该 bundle（安装结果中的「Enable now／立即启用」也可启用）。启用操作会登记当前 profile 的 `dsh.profile.bundles`。

如果选择手动链接，并且已经确认目标 profile 的实际目录，可在 PowerShell 中执行以下占位示例（需要 pnpm）：

```powershell
pnpm --dir 'C:\Path\To\TargetProfile' add 'link:C:\Path\To\plugins\gpt-codex-images'
```

此命令只把本地插件链接为目标 profile 的依赖；还需按下面的说明登记 bundle。链接后保留插件目录，不要移动或删除它。

在目标 profile 的 `package.json` 中，`dsh.profile.bundles` 必须包含包名 `dsh-plugin-gpt-codex-images`。以下仅展示相关字段，合并时保留已有字段和其他 bundle，并避免重复添加：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-plugin-gpt-codex-images"
      ]
    }
  }
}
```

只安装依赖但未登记 bundle，不会加载本插件的补丁。也不要把插件实例 ID `gpt-codex-images` 当成 bundle 包名。

## 配置、登录与启用

在目标 profile 的 `cordis.patch.yml` 中合并以下条目；已有同 ID 条目时修改该条目，不要再创建重复项。机器路径写在 profile 配置里，保留插件自带的 `cordis.patch.yml` 作为通用注册补丁。

以下全部路径均为占位示例，需要替换成你自己的绝对路径：

```yaml
- id: gpt-codex-images
  config:
    installRoot: 'C:\Path\To\DeepSeek Harness'
    dataHome: 'C:\Path\To\DSH-Data'
    requestsEnabled: false
```

- `installRoot`：DSH 程序安装目录，内含 `resources\app.asar`；插件从该安装中加载原生工具和 OAuth 实现。
- `dataHome`：当前运行 DSH 实例的数据目录，不是 profile 目录或插件目录。`dataHome\attachments\v1` 必须与当前实例的实际附件库一致；不一致时插件拒绝启动，避免接到另一份数据。
- `requestsEnabled`：只控制生成和编辑。默认关闭；必须改为 YAML 布尔值 `true` 才能生成或编辑。缺省、`false` 或字符串 `"true"` 均不会启用。状态检查和已有图片展示不受此开关限制。

1. 在使用该目标 profile 的 DSH 中，通过原生账号入口登录 ChatGPT / Codex。无需向插件配置中填写 API Key、Cookie 或令牌，也不要复制登录文件。
2. 保存 profile 配置后，完全退出 DSH（包括托盘中的后台实例）并重新启动同一 profile；仅关闭窗口或刷新页面不足以确保加载新插件。
3. 保持 `requestsEnabled: false` 时，可先调用 `codex_image_status` 检查本机登录接线，或调用 `codex_image_show_saved` 展示已有图片。状态检查不会刷新即将过期的登录；生成和编辑时才可能通过原生凭据服务刷新。
4. 准备使用当前账号生成或编辑图片时，将该项改为布尔值 `true`，保存后再次完全退出并重启 DSH。只在明确的图片任务中调用生成或编辑工具。

## 用量与超时

图片请求使用 Codex 订阅通道，与 Codex 共用订阅用量，不是一套独立额度。插件没有查询剩余额度或核验实际账单的功能，实际权益、限额及计费以账号和服务端记录为准。

状态检查和已有图片展示的工具超时为 30 秒；生成和编辑的工具及内部请求超时为 300 秒（5 分钟），也可能被上层任务提前取消。超时或中断不等于服务端未收到请求，服务端可能仍在处理或已消耗用量。

失败不会自动重试，也不会切换到 Grok、网页聊天或 API Key。遇到超时先检查已有结果和账号记录，不要连续重复生成。服务端已返回图片、仅本地保存或预览失败时，同样不应重新生成。

## 常见故障排查

- 找不到工具或画廊未出现：确认安装和启用的是当前目标 profile，bundle 已登记，插件目录仍存在；完全退出并重启 DSH，检查插件加载错误。
- 提示需要 `installRoot` / `dataHome`，或原生依赖加载失败：检查两项是否为正确绝对路径，安装目录是否含 `resources\app.asar`，并核对 DSH 版本。
- 提示附件库不匹配：`dataHome\attachments\v1` 必须对应当前实例的附件库；修正路径，不要移动附件或复制登录文件来凑路径。
- 提示图片请求尚未启用：在当前 profile 配置中设置布尔值 `true` 后完全重启；状态检查和已有图片展示不要求开启。
- 登录缺失、账号标识无效或刷新失败：在 DSH 原生 ChatGPT / Codex 入口检查或重新登录，再完全退出并重启。状态检查只读本机记录，不会修复或刷新登录。
- 图片不可读、格式或大小被拒绝：检查 `image_path` 是否为已授权的普通文件、沙盒是否可读、内容是否为 PNG/JPEG/WebP，以及是否超出插件或 DSH 的大小限制。
- HTTP 拒绝、限额或权限错误：根据错误检查原生登录、账号图片权限和服务端用量限制；状态成功不能排除这些问题。不要通过反复重试或切换认证方式绕过限制。
- 超时、中断或提示已有任务执行中：等待当前任务，检查账号记录及已有结果，避免重复提交。
- 原图已保存，但预览或文件卡失败：先使用返回的原图路径；可用 `codex_image_show_saved` 再次展示已有图，或用 DSH 原生 `present` 展示已有文件，不要重新出图。

## 反馈

后续根据实际使用反馈调整。遇到问题，可在本项目的 GitHub Issues 中说明 DSH 版本、插件版本、所用工具、复现步骤及脱敏后的报错。请勿提交账号凭据、令牌、Cookie 或密钥。

## 许可

[MIT](./LICENSE)
