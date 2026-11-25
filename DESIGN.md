---
name: "Shine"
description: "个人音乐网页的暖白视觉系统"
colors:
  bg: "#f5f1ed"
  shell: "#f8f5f2"
  surface: "#fcfaf7"
  surface-deep: "#f5f2ee"
  surface-soft: "#efebe6"
  surface-hover: "#ede8e2"
  surface-active: "#e7e1da"
  border: "#ded8d0"
  border-strong: "#cfc6bc"
  text-primary: "#252420"
  text-secondary: "#45413c"
  text-muted: "#656059"
  accent: "#f2ebe2"
  accent-hover: "#ebe2d6"
  accent-active: "#e3d8ca"
  accent-ink: "#302820"
  accent-soft: "#eee8e0"
  accent-border: "#897968"
  accent-strong: "#463c32"
  range-track: "#918980"
  scroll-thumb: "#b3a99e"
  danger: "#9d303e"
  danger-soft: "#fae8e8"
  danger-border: "#d6a0a5"
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
    backgroundColor: "{colors.surface}"
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

Shine 首页使用暖白底、近白面板与暖灰细边框建立层次。搜索、播放和当前音乐库分类使用同色系底色，配合深色文字或图标。播放时，封面附近带有淡暖色环境光。

## Colors

- 页面使用 bg，外壳使用 shell，顶栏与三栏面板使用 surface。歌词内框、搜索框和筛选框使用 surface-deep。
- 炭灰用于主信息，暖灰用于辅助说明、未高亮歌词和占位文字。
- accent 与 accent-border 配合用于主要按钮和选中的音乐库标签。深暖灰用于焦点、可操作文字和进度填充。
- danger、danger-soft 与 danger-border 用于删除和错误反馈。

## Typography

正文与界面信息使用前置 tokens 中的本地中英文字体栈，不额外下载字体。歌曲名与面板标题依靠大小和字重建立层级；歌词保留更宽松行高。

- **Player title**：当前歌曲名，最多两行；常规桌面使用 player-title，小屏改为 19px，低高度桌面改为 20px。
- **Panel title**：三个主要区域的标题。
- **Lyrics**：居中歌词，手机使用 16px。当前行提高对比度，允许动效时轻微放大，统一字重减少长句换行变化。强调模式增加暖色底。
- **Body / Song title / Label**：基础正文、列表歌名和操作说明。长列表标题省略，完整标题保留提示。
- 时间与序号使用等宽数字；不将辅助说明升级为装饰性标题。

## Layout

当前首页上方为圆形头像和 Shine。常规桌面外壳最大宽度 1280px，左右留白合计 64px，上下边距 32px；外壳和三栏间距采用 md。三栏实际网格为 `minmax(220px, 1fr) minmax(420px, 2fr) minmax(270px, 1.08fr)`，依次为搜索、播放器与歌词、音乐库。固定视口内的歌词和列表各自滚动，没有独立底部播放栏。

宽度不超过 1100px 时改为单列，顺序是播放器、搜索、音乐库，顶部固定快捷导航可跳到这三个区域。未选歌时收起歌词区，小屏无歌词时保留紧凑状态提示。宽度不超过 600px 时外壳左右各留 8px，外壳内边距 8px，间距 10px，歌单卡片改为单列。高度不超过 740px 且宽度至少 1101px 时减小页边距、头像与唱片插画，为歌词留出空间。

手机的主要播放、分类、列表和歌词操作使用至少 44px 触控区域。搜索字段与按钮为 38px 高，搜索框整体为 48px，不把这一尺寸泛化到其他按钮。进度与音量输入的外盒为透明 44px 高，内部轨道分别为 8px 和 4px；轨道粗细和触控区域分开处理。

## Elevation & Depth

外壳、顶栏与三栏面板用暖白底和细边框区分。外壳、唱片封面与弹层保留轻微的暖灰阴影。环境光局限于播放器的封面附近，歌词内框使用不透明的浅暖灰背景。

## Shapes

控件为胶囊或圆形，面板为中等圆角，列表行与歌单卡片使用较小圆角。边框通常为 1px 暖灰。

头像使用用户提供的 `code/frontend/static/shine-avatar.jpg` 原图，CSS 圆裁、`object-fit: cover` 与 `object-position: 50% 42%`。播放器将用户第二张图片 `code/frontend/static/player-illustration.png` 用作默认插画，保留原图像素和完整音符。插画与歌曲封面共用方形区域，以 `object-fit: contain` 完整展示。唱片图片使用浅色底、16px 外圆角与暖灰细边框，桌面宽 124px、紧凑桌面宽 96px、手机宽 88px；内留白分别 5px、5px、3px。桌面布局容器跨歌曲信息、进度和播放控制三行，自动撑满右侧总高度，顶部与底部对齐；容器自身透明，底色与边框只绘制在方形图片上，图片下方不留下色块。图片保持原尺寸并靠顶部，不移动右侧控件。手机容器与右侧歌曲信息同高，进度和控制继续独立铺满宽度。两张图片均非生成图。

## Components

### Buttons

主要按钮使用暖白底、暖灰边框与深暖灰文字，沿用圆形或胶囊形。次级按钮使用浅暖灰底和细边框。键盘焦点使用深暖灰轮廓，搜索框和歌词区分别在容器外侧和内侧显示焦点。禁用态降低透明度并显示不可用光标；触控尺寸随手机断点扩大。

### Inputs / Fields

搜索框为胶囊边框容器，内部字段透明，右侧为带暖灰边框的暖白搜索按钮。聚焦时边框加深，键盘焦点显示外轮廓。列表筛选使用小圆角暖白输入框。输入保持真实标签或可访问名称，不依赖 placeholder 作为唯一说明。

### Navigation

四类音乐库使用胶囊式分类栏，带暖灰边框的暖白指示条在分类间移动，选中项使用深色粗体。返回已浏览的分类时恢复列表位置。手机分类项至少 44px 高。浏览分类不改变已建立的播放队列；队列有独立入口和当前歌曲定位操作。

### Cards / Containers

搜索、播放器和音乐库使用细边框圆角面板；歌单使用小圆角卡片。歌曲行在 hover、键盘进入和选中时改变表面色，当前播放行使用加粗的深色标题、浅暖灰底与播放图标。收藏批量栏与歌单详情操作栏在列表内保持可见。

歌单卡片顶部保留图标、单行名称与完整歌曲数量；长名称省略显示并通过标题提示保留全文。卡片的“播放全部”使用横向胶囊按钮，文字不换行；桌面至少 36px 高，手机至少 44px 高。

### Lyrics & Player Illustration

歌词区独立滚动，清晰高亮使用炭灰文字，强调高亮使用深暖灰文字与浅暖灰底。首尾留白让当前行可以居中，相邻歌词平滑跟随，跨屏跳转直接定位。手动滚动会立即接管，点击「回到当前歌词」恢复跟随。按钮与 L 切换同一状态，浏览器以 `shine_lyrics_effect` 记忆偏好，旧的霓虹偏好映射到强调高亮。输入、组合输入、弹层和修饰键不触发快捷切换。切换不重置播放进度或歌词滚动。

唱片插画按原始黑白色彩呈现，作为默认封面。切歌时歌曲信息轻淡入，歌曲封面解码完成后在固定尺寸区域更新，过期的加载结果会跳过。播放按钮在播放、暂停和连接图标之间交接，状态文字及等化器同步表达播放变化。

播放器顶部按用户提供的控制布局截图组织：桌面插画在左侧，右侧依次排列歌曲信息、进度条与控制行。上一首、暖白播放/暂停、下一首紧凑成组，音量图标与滑条靠控制行右端。收藏、下载在歌曲信息右上方横向排列。600px 以下进度与控制行跨两列铺满宽度，收藏、下载竖排，音量仍直接显示；统一使用现有音量滑条，不另开音量弹层。音量滑条高度为 44px，内部使用 4px 轨道和 14px 炭灰滑块，填充终点随滑块中心移动。紧凑宽度优先保留播放和音量操作。

全站图标共享本地 SVG，统一采用 24×24 坐标、圆端点和圆角描边。列表控件为 16px，常用操作为 18px，上、下一首为 20px，主播放键为 22px。次级图标使用暖灰，主要控件按下时轻微收缩。收藏选中使用深暖灰实心图标，警示使用深红与浅红。触屏主要图标按钮保留至少 44px 区域。素材来源和许可与 SVG 一起保存。

下载页通过“批量删除”展开勾选与操作栏，复用收藏页的工具条样式。全选范围是当前筛选列表，修改筛选清空已有勾选；删除按钮使用危险色，执行时禁用选择、筛选和重复提交。确认框说明本地文件不可恢复及关联收藏、歌单清理范围。结果保留在列表上方，失败项保留勾选并显示原因；长错误内容自动换行、独立滚动。小屏按钮与勾选区域保留 44px 触控高度。

取消收藏和从歌单移除歌曲使用右下角撤销提示。提示保留最近一次移除，用户可继续浏览或手动关闭，焦点留在当前操作处。

## Motion

按下反馈使用 90ms，常规颜色、勾选和图标变化使用 130ms，内容变化使用 180ms，分类指示、歌词缩放和弹层位移使用 230ms。进入采用减速曲线，弹层退出更快。关闭时立即恢复焦点并解除遮挡。环境光以 13 秒往复缓动，播放与暂停之间以 620ms 过渡光强，缓冲、暂停、离屏和网页隐藏时停止流动。进度与音量跟随原生输入，时间和计数使用等宽数字；进度拖动取消后恢复实际播放位置。系统启用减少动态效果时停用位移、缩放、循环动画和平滑滚动，保留短颜色和图标透明度反馈。
