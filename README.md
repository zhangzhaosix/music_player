# 🎵 音乐播放器 - Music Player

一个基于 Flask 的个人音乐播放器，支持在线搜索、试听、下载、收藏和歌单管理。

> 歌曲数据从 [qeecc.com](https://www.qeecc.com) 搜索获取，音频流来自酷我音乐 CDN。

---

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 🔍 **在线搜索** | 搜索 qeecc 音乐库，智能识别歌手与歌曲名 |
| 🎧 **在线试听** | 代理播放未下载的歌曲，支持进度拖拽 |
| ⬇️ **下载歌曲** | 将歌曲下载到本地 `音乐合集/` 目录 |
| ❤️ **收藏夹** | 收藏喜欢的歌曲，快速访问 |
| 📋 **歌单管理** | 创建/编辑/删除歌单，增删歌曲 |
| ▶️ **播放控制** | 播放/暂停、上一首/下一首、进度拖拽 |
| 🔀 **播放模式** | 顺序播放 / 随机播放 / 单曲循环 |
| 🔊 **音量记忆** | 音量大小自动保存，刷新不丢失 |
| 💾 **进度记忆** | 刷新页面后自动恢复歌曲和播放进度 |
| 🎨 **毛玻璃界面** | Glassmorphism 风格，暗色主题 |

---

## 🛠 技术栈

- **后端**: Python + Flask
- **前端**: 原生 HTML + CSS + JavaScript（SPA 单页应用）
- **数据存储**: JSON 文件（`favorites.json` / `playlists.json`）
- **爬取**: requests + BeautifulSoup4
- **样式**: Glassmorphism 毛玻璃 + 渐变填充进度条

---

## 🚀 快速开始

### 环境要求

- Python 3.8+
- pip

### 安装与运行

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 启动服务器
python app.py

# 3. 浏览器访问
# http://127.0.0.1:5000
```

---

## 📁 项目结构

```
music-player/
├── app.py                  # Flask 主程序（后端 API + qeecc 爬取）
├── requirements.txt        # Python 依赖
├── .gitignore              # Git 忽略配置
├── README.md               # 项目说明
├── CLAUDE.md               # AI 辅助开发配置
├── templates/
│   └── index.html          # 前端页面（SPA）
├── static/
│   ├── style.css           # 样式（毛玻璃暗色主题）
│   └── app.js              # 前端交互逻辑
├── 音乐合集/               # 下载的 MP3 文件（本地）
├── favorites.json          # 收藏数据
└── playlists.json          # 歌单数据
```

---

## 📡 API 文档

### 搜索与播放

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/search?q=关键词` | 搜索 qeecc 音乐库 |
| GET | `/api/song-info?url=歌曲URL` | 获取歌曲详情和播放链接 |
| GET | `/api/proxy-stream?url=mp3链接` | 代理播放（支持 Range 请求和进度跳转） |

### 本地音乐管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/music` | 获取本地已下载歌曲列表（含智能歌手识别） |
| GET | `/api/stream/<filename>` | 流式播放本地 MP3 |
| POST | `/api/download` | 下载歌曲到本地 |
| DELETE | `/api/music/<filename>` | 删除本地歌曲 |

### 收藏与歌单

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/favorites` | 获取收藏列表 |
| POST | `/api/favorites` | 添加收藏 |
| DELETE | `/api/favorites` | 移除收藏 |
| GET | `/api/playlists` | 获取所有歌单 |
| POST | `/api/playlists` | 创建歌单 |
| PUT | `/api/playlists/<id>` | 更新歌单（增删歌曲、改名） |
| DELETE | `/api/playlists/<id>` | 删除歌单 |

---

## 💡 使用说明

1. **搜索歌曲**: 在搜索框输入关键词，点击"搜索"
2. **播放歌曲**: 点击歌曲旁的播放按钮即可试听，支持拖拽进度条跳转
3. **下载歌曲**: 点击下载按钮将歌曲保存到本地
4. **收藏**: 点击心形图标收藏歌曲
5. **创建歌单**: 在"我的歌单"标签页点击"新建歌单"
6. **添加到歌单**: 点击歌曲旁的"+"按钮选择目标歌单
7. **从歌单移除**: 在歌单详情中点击橙色减号移除歌曲

> ⚠️ 歌曲搜索和在线试听需要后端运行 `python app.py`，仅播放已下载歌曲可离线使用前端界面。

---

## 📄 许可

MIT License

## Windows 快捷启动

双击项目根目录的 `启动音乐网页.bat`，即可在本机启动音乐网页。
