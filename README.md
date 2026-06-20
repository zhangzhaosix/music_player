# 音乐播放器

一个基于 Flask 的个人音乐播放器，支持在线搜索、试听、下载、收藏和歌单管理。

> 当前主搜索源为 [qjjlb.quanjian.com.cn/musicdl/](http://qjjlb.quanjian.com.cn/musicdl/)。

## 功能

- 在线搜索音乐
- 在线试听未下载歌曲
- 下载歌曲到本地 `音乐合集/`
- 收藏歌曲
- 管理歌单
- 记忆音量与播放进度

## 技术栈

- 后端：Python + Flask
- 网络请求：requests + BeautifulSoup4
- 前端：原生 HTML / CSS / JavaScript
- 数据存储：`favorites.json` / `playlists.json`

## 运行要求

- Python 3.8+
- pip

## 安装与运行

```bash
pip install -r requirements.txt
python app.py
```

浏览器访问：`http://127.0.0.1:5000`

## 目录说明

- `app.py`：Flask 主程序与后端 API
- `templates/`：页面模板
- `static/`：前端静态资源
- `音乐合集/`：下载后的本地歌曲
- `favorites.json`：收藏数据
- `playlists.json`：歌单数据

## API

### 搜索与播放

- GET `/api/search?q=关键词`：搜索歌曲
- GET `/api/song-info?url=歌曲URL`：获取歌曲详情和播放直链
- GET `/api/proxy-stream?url=MP3直链`：代理在线播放

### 本地音乐

- GET `/api/music`：获取本地歌曲列表
- GET `/api/stream/<filename>`：播放本地歌曲
- POST `/api/download`：下载歌曲到本地
- DELETE `/api/music/<filename>`：删除本地歌曲

### 收藏与歌单

- GET / POST / DELETE `/api/favorites`
- GET / POST / PUT / DELETE `/api/playlists`

## Windows 启动

双击 `启动音乐网页.bat` 即可启动。
