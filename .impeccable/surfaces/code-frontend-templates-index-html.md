---
version: 1
slug: "code-frontend-templates-index-html"
primary_target: "code/frontend/templates/index.html"
related_targets: ["code/frontend/static/style.css","code/frontend/static/app.js"]
---

# Shine 首页

Mode: Operate. 面向项目所有者的日常听歌、找歌和收藏整理。

## Direction contract

THESIS: 高度还原用户指定的皮卡丘音乐站，放弃原来的大黑胶与抽屉音乐库结构。常用内容同时可见。

OWN-WORLD: 深蓝黑渐变背景、细边框圆角面板、黄色主要操作、蓝色选中态与霓虹光晕；统一轮廓 SVG 图标，保留清晰文字与键盘焦点。

STORY: 用户搜索歌曲，主动点选播放，在右栏切换收藏、歌单和下载；浏览不改变已经建立的播放队列。

FIRST VIEWPORT: 顶部圆形用户头像和 Shine；桌面下方约 1:2:1 三栏。左栏搜索及简表，中栏用户提供的唱片插画和完整播放控制、下方歌词，右栏四类音乐列表与队列入口。手机先播放器，再搜索，再列表。没有独立底部播放栏。

FORM: 用户明确指定的参考站方向，优先于随机候选。Seed c94776e5 已运行，远端候选服务未连接；不引入替代方向。以实际参考页面为视觉基准，code-led 实现。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

约束：固定搜索数量；不增加音源选择、真实封面、语言切换或快捷键说明。只新增歌词霓虹/清晰切换及 L。保留数据、后端接口和已有功能。头像来自用户提供的 1000295373.jpg，原图复制、CSS 圆形裁切。

用户后续确认：原 CSS 黑胶替换为第二张唱片插画，源文件 codex-clipboard-bf769006-55fe-4f09-ae6c-9e785ef4d839.png。完整展示唱片、唱臂和音符，圆角浅色底与深色播放器衔接；插画不整图旋转。
