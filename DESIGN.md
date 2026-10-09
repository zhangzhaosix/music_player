---
name: "Shine"
description: "个人音乐网页的深蓝黑霓虹视觉系统"
colors:
  bg: "#02030a"
  bg-deep: "#070a1e"
  surface: "#10162c"
  surface-deep: "#080a1a"
  panel: "#0a0e2342"
  surface-soft: "rgba(136, 196, 255, .07)"
  surface-hover: "rgba(136, 196, 255, .12)"
  surface-active: "rgba(136, 196, 255, .19)"
  border: "rgba(166, 190, 255, .13)"
  border-strong: "rgba(166, 190, 255, .26)"
  text-primary: "#f5f6ff"
  text-secondary: "#c0cbe7"
  text-muted: "#a4b2d2"
  accent: "#f5c84c"
  accent-ink: "#231b08"
  accent-soft: "rgba(245, 200, 76, .13)"
  blue: "#88c4ff"
  danger: "#ffb4be"
  lyric-active: "#ffe39d"
  selection-text: "#d9edff"
typography:
  player-title:
    fontFamily: "\"Segoe UI\", \"Microsoft YaHei\", \"PingFang SC\", system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.4
  panel-title:
    fontFamily: "\"Segoe UI\", \"Microsoft YaHei\", \"PingFang SC\", system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.2
  lyrics:
    fontFamily: "\"Segoe UI\", \"Microsoft YaHei\", \"PingFang SC\", system-ui, sans-serif"
    fontSize: "17px"
    lineHeight: 1.7
  body:
    fontFamily: "\"Segoe UI\", \"Microsoft YaHei\", \"PingFang SC\", system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  song-title:
    fontFamily: "\"Segoe UI\", \"Microsoft YaHei\", \"PingFang SC\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.5
  label:
    fontFamily: "\"Segoe UI\", \"Microsoft YaHei\", \"PingFang SC\", system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: 1.5
rounded:
  row: "10px"
  card: "12px"
  inner-panel: "16px"
  panel: "18px"
  shell: "24px"
  control: "999px"
  circle: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
    height: "34px"
  button-secondary:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "34px"
  search-input:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    padding: "0 2px 0 28px"
    height: "34px"
    width: "100%"
  library-tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.control}"
    padding: "6px 3px"
    height: "30px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
    padding: "14px 12px"
  playlist-card:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
    padding: "12px"
---

# Design System: Shine

## Overview

**Creative North Star: "深蓝黑霓虹音乐空间"**

以用户指定参考站的深蓝黑霓虹语言承载个人听歌空间。细边框、半透明面板与柔和光晕构成层次；金色让播放和主要操作可见，蓝色标识当前歌曲与分类状态。

保留 PRODUCT.md 中音乐优先、内容真实和操作直接的约束。当前首页的三栏与固定唱片插画来自用户确认；这些首页组成记录在 Layout 中，不推广为所有未来页面必须使用的模板。

**Key Characteristics:**

- 深蓝黑底色与细边框圆角面板。
- 金色主要操作、蓝色选中态，文字保持清晰。
- 用户原始头像与用户提供的唱片插画，统一轮廓 SVG 图标。
- 键盘焦点、清晰歌词模式与减少动态效果偏好。

## Colors

深色中性层为歌曲和歌词留出空间，暖金与浅蓝分别表达操作重点和状态。

### Primary

- **暖金**：主要按钮、播放按钮、进度滑块、播放状态与霓虹歌词；深金墨色承载按钮文字。

### Secondary

- **浅蓝**：分类选中态、当前歌曲、搜索入口和键盘焦点；半透明蓝色铺在 hover、active 与柔和表面上。

### Neutral

- **深蓝黑**：页面、面板、弹层与工具条的层次。
- **近白与蓝灰**：主文字、说明与次级信息。边框沿用半透明蓝灰。
- **柔粉警示**：失败反馈和删除操作。

### Named Rules

**The State Color Rule.** 金色承担主要操作和霓虹歌词高亮；蓝色承担选中、当前歌曲与键盘焦点，状态另有文字或语义标记。

## Typography

正文与界面信息使用前置 tokens 中的本地中英文字体栈，不额外下载字体。歌曲名与面板标题依靠大小和字重建立层级；歌词保留更宽松行高。

- **Player title**：当前歌曲名，最多两行；常规桌面使用 player-title，小屏改为 19px，低高度桌面改为 20px。
- **Panel title**：三个主要区域的标题。
- **Lyrics**：居中歌词；手机使用 16px。当前行加强字重，清晰模式取消放大与文字光晕。
- **Body / Song title / Label**：基础正文、列表歌名和操作说明。长列表标题省略，完整标题保留提示。
- 时间与序号使用等宽数字；不将辅助说明升级为装饰性标题。

## Layout

当前首页上方为圆形头像和 Shine。常规桌面外壳最大宽度 1280px，左右留白合计 64px，上下边距 32px；外壳和三栏间距采用 md。三栏实际网格为 `minmax(220px, 1fr) minmax(420px, 2fr) minmax(270px, 1.08fr)`，依次为搜索、播放器与歌词、音乐库。固定视口内的歌词和列表各自滚动，没有独立底部播放栏。

宽度不超过 1100px 时改为单列，顺序是播放器、搜索、列表；页面可纵向滚动。宽度不超过 600px 时外壳左右各留 8px，外壳内边距 8px，间距 10px，歌单卡片改为单列。高度不超过 740px 且宽度至少 1101px 时减小页边距、头像与唱片插画，为歌词留出空间。

手机的主要播放、分类、列表和歌词操作使用至少 44px 触控区域。搜索字段与按钮为 38px 高，搜索框整体为 48px，不把这一尺寸泛化到其他按钮。进度与弹出音量的 range 外盒为透明 44px 高，内部轨道 8px 高；轨道粗细和触控区域分开处理。

## Elevation & Depth

深度来自半透明色层、径向渐变、细边框和柔和阴影的组合。页面外壳与面板有暗色投影；主要按钮与活动歌词使用暖金光晕，蓝色状态使用局部柔光。这是所选霓虹材质的一部分，不应禁止其原生光晕；清晰歌词模式则去掉当前行的文字光晕。

阴影、文字光晕、焦点和动态值记录在 sidecar 的 extensions 与组件 snippets 中，避免把它们塞入前置 token schema。

## Shapes

控件为胶囊或圆形，面板为中等圆角，列表行与歌单卡片使用较小圆角。边框通常为 1px 半透明蓝灰，不使用硬偏移阴影。

头像使用用户提供的 `code/frontend/static/shine-avatar.jpg` 原图，CSS 圆裁、`object-fit: cover` 与 `object-position: 50% 42%`。播放器固定使用用户第二张图片 `code/frontend/static/player-illustration.png`，保留原图像素和完整音符，以 `object-fit: contain` 展示，不切换真实专辑封面。唱片图片使用浅色底、16px 外圆角与细金色边框，桌面宽 124px、紧凑桌面宽 96px、手机宽 88px；内留白分别 5px、5px、3px。桌面布局容器跨歌曲信息、进度和播放控制三行，自动撑满右侧总高度，顶部与底部对齐；容器自身透明，底色与边框只绘制在方形图片上，图片下方不留下色块。图片保持原尺寸并靠顶部，不移动右侧控件。手机容器与右侧歌曲信息同高，进度和控制继续独立铺满宽度。两张图片均非生成图。

## Components

### Buttons

主要按钮采用暖金背景和深金墨文字，胶囊形；渐变和阴影见 sidecar。次级按钮使用柔和半透明蓝底与边框，图标控制为圆形。全局键盘焦点为蓝色 2px 外轮廓、3px 偏移。禁用态降低透明度并显示不可用光标；触控尺寸随手机断点扩大。

### Inputs / Fields

搜索框为胶囊边框容器，内部字段透明，右侧金色搜索按钮；聚焦容器时蓝色边框与柔光共同显示。列表筛选使用小圆角暗色输入框。输入保持真实标签或可访问名称，不依赖 placeholder 作为唯一说明。

### Navigation

四类音乐库使用胶囊式分类栏，活动项为蓝色渐变和浅色文字。手机分类项至少 44px 高。浏览分类不改变已建立的播放队列；队列有独立入口和当前歌曲定位操作。

### Cards / Containers

搜索、播放器和音乐库使用细边框圆角面板；歌单使用小圆角卡片。歌曲行在 hover、键盘进入和选中时改变表面色，当前播放行同时显示蓝色标题、背景和播放语义。收藏批量栏与歌单详情操作栏在列表内保持可见。

歌单卡片顶部保留图标、单行名称与完整歌曲数量；长名称省略显示并通过标题提示保留全文。卡片的“播放全部”使用横向胶囊按钮，文字不换行；桌面至少 36px 高，手机至少 44px 高。

### Lyrics & Player Illustration

歌词区独立滚动，活动行使用暖金高亮与轻微放大；清晰模式改为白色、不发光、不放大。按钮与 L 切换同一状态，浏览器以 `shine_lyrics_effect` 记忆偏好；输入、组合输入、弹层和修饰键不触发快捷切换。切换不重置播放进度或歌词滚动。

唱片插画保持静态，避免唱臂与音符随整图旋转。原图文件不变，按原始黑白色彩呈现，不添加混合染色。播放状态继续由播放按钮、状态文字及均衡器表达。减少动态效果偏好关闭动画、过渡与平滑滚动。歌词过渡使用 180ms，列表和控制状态使用 160ms。

播放器顶部按用户提供的控制布局截图组织：桌面插画在左侧，右侧依次排列歌曲信息、进度条与控制行。上一首、金色播放/暂停、下一首紧凑成组，音量图标与滑条靠控制行右端。收藏、下载在歌曲信息右上方横向排列。600px 以下进度与控制行跨两列铺满宽度，收藏、下载竖排，音量仍直接显示；统一使用现有音量滑条，不另开音量弹层。音量滑条高度为 44px，内部使用 4px 轨道和 14px 清晰金色滑块，去除强光晕，填充终点随滑块中心移动。紧凑宽度优先保留播放和音量操作。

下载页通过“批量删除”展开勾选与操作栏，复用收藏页的工具条样式。全选范围是当前筛选列表，修改筛选清空已有勾选；删除按钮使用危险色，执行时禁用选择、筛选和重复提交。确认框说明本地文件不可恢复及关联收藏、歌单清理范围。结果保留在列表上方，失败项保留勾选并显示原因；长错误内容自动换行、独立滚动。小屏按钮与勾选区域保留 44px 触控高度。

## Do's and Don'ts

### Ambient sky

全站共享一层固定视口星空，桌面使用 96 个冷蓝星点，12 个以 5–9 秒周期缓慢明暗变化，大星点带轻微光晕；两层蓝色光雾以 22/28 秒周期缓慢位移和明暗变化，手机显示 36 个静态星点与静态光雾。外壳深色底透明度 .18，搜索、播放器、音乐库和顶部面板为 .66，歌词阅读底为 .9；保留原布局和控件。流星轮流从顶部、左侧和右侧进入，穿过半透明区域时自然减弱，装饰不接收点击。桌面间隔 3.2–5.4 秒，尾长 260–380px，单次 2.1–2.7 秒，峰值透明度 .8；每第三次带一颗延迟 .32 秒、尾长为主流星 .65 倍的伴随流星，全页最多两颗，复用固定元素与单个定时器。手机仅单流星，间隔 6–10 秒，尾长 140–200px。初次开启或恢复后桌面 1.2 秒、手机 1.8 秒出现第一颗。播放和暂停不改变动效。

顶部“动态背景”以 aria-pressed 表达状态，浏览器使用 shine_ambient_motion 记忆选择。关闭后保留静态星空；系统减少动态效果优先，页面隐藏、弹窗和歌曲操作菜单打开时停止调度。原生 CSS 仅动画位移和透明度，不使用视频、Canvas、动效库或逐帧脚本。参考花瓣 pins/4654955414 的冷色流星拖尾和 pins/4655316946 的错落星点，以代码重新绘制，不使用参考素材文件。

### Do:

- **Do** 使用现有金色操作与蓝色状态关系，并保留明确的文字反馈。
- **Do** 为图标按钮保留可访问名称、可见焦点，并在手机样式下扩大触控区域。
- **Do** 保持歌词霓虹与清晰模式都可读；尊重减少动态效果偏好。
- **Do** 使用用户提供的头像原图，以 CSS 圆形裁切呈现。

### Don't:

- **Don't** 用真实专辑封面或生成图片替换用户确认的唱片插画与头像。
- **Don't** 在当前首页重新增加独立底部播放栏，或恢复已替换的抽屉式音乐库。
- **Don't** 用额外音源选择、语言切换、快捷键说明面板或虚构信息增加界面负担。
- **Don't** 将背景光晕扩展为所有正文文字的强光效果；普通说明保持清晰。
