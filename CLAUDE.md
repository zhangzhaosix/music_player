# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重要工作规则

### 四个执行原则

1. **编码前先思考** — 不要假设，不要隐藏困惑，必要时呈现权衡：
   - 明确说明假设；如果不确定，先询问而不是猜测
   - 存在歧义时，呈现多种解释，不要默默选择
   - 如果存在更简单的方法，适时提出异议
   - 困惑时停下来，指出不清楚的地方并要求澄清
2. **简洁优先** — 用最少的代码解决问题，不要过度推测：
   - 不添加要求之外的功能
   - 不为一次性代码创建抽象
   - 不添加未要求的“灵活性”或“可配置性”
   - 不为不可能发生的场景做错误处理
   - 如果 200 行代码可以写成 50 行，优先简化
   - 检验标准：资深工程师会觉得这过于复杂吗？如果是，简化
3. **精准修改** — 只碰必须碰的，只清理自己造成的混乱：
   - 不“改进”相邻的代码、注释或格式
   - 不重构没坏的东西
   - 匹配现有风格，即使更倾向于不同写法
   - 发现无关死代码时只提及，不主动删除
   - 删除因本次改动而变得无用的导入、变量、函数
   - 检验标准：每一行修改都应能直接追溯到用户请求
4. **目标驱动执行** — 定义成功标准，循环验证直到达成：
   - 将指令式任务转化为可验证的目标
   - 多步骤任务先说明简短计划：
     1. `[步骤]` → 验证：`[检查]`
     2. `[步骤]` → 验证：`[检查]`
     3. `[步骤]` → 验证：`[检查]`
   - 成功标准要具体，避免“让它工作”这类弱标准

### GitHub 同步流程

1. **满意确认** — 当我说“满意”以后，帮我同步至 GitHub 仓库
2. **首次上传** — 第一次上传需要我提供仓库名称，我创建仓库后再进行上传
3. **README 文件** — 推送至 GitHub 时，项目中必须有 README.md 文件说明项目；如果没有就创建一个
4. **README 更新** — 如果项目有改动，同步前对应修改 README.md

### 技能分工

### 网页开发 → superpowers 系列 skills

承担 **产品经理 + 测试开发 + 调试** 职责：

- 先调用 `superpowers:brainstorming` 确认需求和设计方案
- 开发过程遵循 `superpowers:test-driven-development` 或 `superpowers:executing-plans`
- 完成后调用 `superpowers:requesting-code-review` 做代码审查
- 修复问题使用 `superpowers:systematic-debugging`

### 网页美化 → ui-ux-pro-max skills

承担 **UI 设计 + 页面美化 + 前端设计** 职责：

- 布局、配色、字体、动效等视觉相关全部交由 `ui-ux-pro-max` 处理
- 涉及风格选择（毛玻璃、极简、Bento Grid 等）时优先调用此 skill
- 支持 responsive 适配、暗色模式、无障碍等前端设计决策

### UI 设计监督 → impeccable skill

承担 **UI 设计监督** 职责：

- 检查视觉方案是否存在 AI 常见设计错误
- 防止页面出现明显“AI 味”
- 对布局、层级、间距、字体、配色、动效提出监督意见

## 项目概述

个人音乐播放器，Flask + 原生 HTML/CSS/JS。歌曲从 qeecc.com 搜索获取，支持在线试听、下载到本地、收藏、创建歌单。

## 常用命令

```bash
pip install -r requirements.txt
python app.py              # 启动服务器，访问 http://127.0.0.1:5000
```

## 项目结构

```
聊天框9--音乐页面/
├── app.py                  # Flask 主程序（后端 API + qeecc 爬取）
├── requirements.txt        # Python 依赖
├── templates/index.html    # 前端页面
├── static/
│   ├── style.css           # 样式
│   └── app.js              # 前端交互逻辑
├── 音乐合集/               # 下载的 MP3 文件
├── favorites.json          # 收藏数据
└── playlists.json          # 歌单数据
```

## qeecc.com 接口文档

### 搜索
- URL: `https://www.qeecc.com/so/{关键词}.html`
- 方法: GET
- 前端 JS 实现: `window.open("/so/" + key + '.html')`
- 解析: 页面中 `<a href="/song/xxx.html">` 标签，文本格式 `歌手·歌曲名[MP3]`
- 注意: 先访问首页获取 cookies，再请求搜索

### 播放 API（获取 MP3 链接）
- URL: `https://www.qeecc.com/js/play.php`
- 方法: POST
- 参数: `id={歌曲ID}`, `type=music`
- 返回: `{"msg":1, "lkid":255870288, "title":"...", "url":"https://...m4a", "pic":"..."}`
- 歌曲 ID: 从 `/song/{id}.html` URL 中提取
- 注意: 返回的音频链接来自 kuwo.cn CDN，有时效性

### 后端 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/search?q=xxx` | GET | 搜索 qeecc |
| `/api/song-info?url=xxx` | GET | 获取歌曲详情+MP3链接 |
| `/api/music` | GET | 本地音乐列表 |
| `/api/stream/<filename>` | GET | 流式播放本地MP3 |
| `/api/proxy-stream?url=xxx` | GET | 代理播放(未下载歌曲) |
| `/api/download` | POST | 下载MP3到本地 |
| `/api/favorites` | GET/POST/DELETE | 收藏管理 |
| `/api/playlists` | GET/POST | 歌单列表/创建 |
| `/api/playlists/<id>` | PUT/DELETE | 歌单更新/删除 |

## 数据存储

- `favorites.json`: `[{id, title, artist, url, filename, downloaded, added_at}]`
- `playlists.json`: `[{id, name, songs: [songId], created_at}]`
- `音乐合集/`: 下载的 MP3 文件
