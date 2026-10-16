# 开发说明

## 实现边界

仓库仅有一个可安装用户脚本。它使用工厂导出，使浏览器运行和 Node 测试共用同一份实现，不依赖构建工具或第三方运行时库。

```js
const {
  createNextVideo,
  readQuestion,
  readPaperQuestion,
  readSubmitConfirmation,
  resolveAnswer,
  createTransport,
  createApp,
  createPanel,
  SPEEDS
} = require('../jsnu-course-assistant.user.js');
```

## 主要模块

| 模块 | 职责 |
|---|---|
| createNextVideo | 课程识别、媒体结束、原生换课契约、播放速度 |
| readQuestion | 视频习题和已打开试卷的 DOM 读取 |
| readPaperQuestion | 试卷序号、总题数、选项及下一题/提交按钮 |
| resolveAnswer | 返回格式、题干及选项映射校验 |
| createTransport | 固定官方 HTTPS 地址、GM 网络请求、取消与超时 |
| createApp | 查询、AI 备用请求、逐项选择、提交与导航状态机 |
| createPanel | 左上角统一界面、Token 管理及倍速选择 |
| bootstrap | 单一启动入口和统一清理 |

## 网站契约

### 视频

媒体选择器为 `.right video`。当前课程身份从组件 `model.id` 读取，URL id 可能在同页切换后过时。组件通过视频祖先的 Vue 实例定位，需要具备 `$refs.videoPlayer`、`treeData`、`model.id`、`graphId` 和 `onSelect`。

切换下一节沿用原契约：

```js
vm.onSelect([next.key], {
  node: { label: next.label, eventKey: next.key }
});
```

仅处理可信媒体结束事件，等待结束位置、缓冲时间、新媒体和新题目列表。内部 Vue 字段具有版本依赖，网站升级后需重新核对。

### 视频习题

读取可见、标题为“视频习题”的 `.ant-modal-content`。题干 `.sub-title`，类型 `.type`，选项行 `.can-scroll .mb-12`，字母 `.letter`，文字 `.option`，提交 `.submit-container button`。提交文字经 NFKC 和空白规范化。

### 试卷

根为 `.exam-modal`。题干 `.can-scroll .stem`，类型 `.grey`，总题数 `.remark`；选项从输入控件 value 和相邻 `.ml6` 读取。

`.custom-btn button` 中提交按钮并非末题专属。只有题号等于总题数、下一题缺失且网站未答标记清空时，才允许最终提交。交卷确认只匹配标题“是否提交”、内容“确认提交试卷?”的对话框。

## 作答状态

```text
query → [query-ai] → filling → filled
                              ├─ submitted（视频习题）
                              ├─ navigating（试卷下一题）
                              └─ confirming → submitted（最终交卷）
```

filling 每轮仅点击一个输入框，下一轮重新读取题目并确认已选集合，避免受控 checkbox-group 的同步点击竞争。根节点、题目键、路由和人工选择变化均会阻止应用旧结果。

## 题库与 AI

使用 `GM_xmlhttpRequest` 对 `https://tk.enncy.cn/query` 发起 POST，发送当前题干、换行拼接的选项、题型、Token、v=2 等配置。Token 从 GM 存储的 `enncy-token` 读取；倍速保存于 `jsnu-playback-rate`。

普通查询超时 20 秒。题干不匹配或 code=0 时，只追加一次 AI 查询，超时 120 秒；AI 响应必须明确 `data.ai === true`，并能唯一映射到当前选项。

本地与 AI 请求分别带 `__local_only__: true/false`。此参数来自官方 GET 客户端，POST v2 的实际服务端语义仍需独立验证；因此界面不会仅凭请求参数就宣称已经获得 AI 答案。账户需开启官方 AI 并使用强制 AI 模式。

## 测试与证据

开发阶段记录为 62 项本地测试通过，覆盖媒体生命周期、题目映射、网络取消/超时、多选异步更新、面板、末题导航和 AI 备用流程。仓库内保留可复现测试代码，历史测试不会自动转化为后续修改的验证结论。

维护时应按需要重新运行测试，并在目标网站验证真实多选、查询、提交、续播或逐题导航。记录真实结果与未验证边界，避免仅通过合成事件就宣称网站流程已通过。

仓库不包含个人账户截图、Token、登录票据、完整网站源码快照或本地交付 ZIP。
