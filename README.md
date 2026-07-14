# 音乐播放器

一个基于 Flask 的个人音乐网页，支持在线搜索、试听、下载、收藏和歌单管理。

当前搜索外部接口优先使用 QQ 音乐，失败时自动尝试备用源。

## 功能

- 在线搜索音乐
- 在线试听未下载歌曲
- 下载歌曲到本地 `音乐合集/`
- 收藏歌曲
- 管理歌单
- 记忆音量与播放进度
- 批量选中歌曲后可一键本地下载，已下载歌曲会自动跳过
- 删除本地歌曲与删除歌单使用站内确认弹层，不再调用浏览器原生确认框

## 技术栈

- 后端：Python + Flask
- 网络请求：Requests
- 前端：原生 HTML / CSS / JavaScript
- 数据存储：`data/favorites.json`、`data/playlists.json`、`data/downloads.json`

## 目录结构

- `AGENTS.md`：项目级协作规则
- `code/backend/app.py`：Flask 主程序与后端 API
- `code/frontend/templates/`：页面模板
- `code/frontend/static/`：前端静态资源
- `data/`：收藏、歌单和下载索引等运行数据
- `音乐合集/`：下载后的本地歌曲
- `tests/`：自动化测试
- `scripts/启动音乐网页.bat`：Windows 启动脚本

## 运行要求

- Python 3.8+
- `pip`

## 本地启动

```bash
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe code\backend\app.py
```

浏览器访问：`http://127.0.0.1:5000`

Windows 下也可以直接双击 `scripts/启动音乐网页.bat`。

## 环境变量

当前项目没有必填环境变量。

如果后续新增配置项，优先以代码默认值和实际实现为准，并同步更新本文件。

## API 概览

### 搜索与播放

- `GET /api/search?q=关键词&source_limit=20`：搜索歌曲，`source_limit` 控制单个来源的抓取数量
- `GET /api/song-info?url=歌曲URL`：获取歌曲详情和播放直链
- `GET /api/proxy-stream?url=MP3直链`：代理在线播放

### 本地音乐

- `GET /api/music`：获取本地歌曲列表
- `GET /api/stream/<filename>`：播放本地歌曲
- `POST /api/download`：下载歌曲到本地
- `DELETE /api/music/<filename>`：删除本地歌曲

### 收藏与歌单

- `GET / POST / DELETE /api/favorites`
- `GET / POST / PUT / DELETE /api/playlists`

## 常见问题

### 为什么搜索结果有时会切换来源？

项目会优先尝试 QQ 音乐；当该来源不可用时，会自动切换到备用来源，尽量保证搜索可用。

### 为什么有些歌显示已下载，但本地没找到文件？

本地下载状态同时依赖 `音乐合集/` 和 `data/downloads.json`。如果手动移动或删除了文件，建议重新下载或检查下载索引是否一致。

### 为什么播放或搜索失败？

通常是外部接口临时不可用、网络受限，或者本机代理设置不匹配。可稍后重试，或先确认本机网络权限。

## 部署注意事项

- 生产环境请保证 `音乐合集/` 和 `data/` 下的运行数据可读写
- 不要把本地下载歌曲、缓存和临时文件提交到仓库
- 如果部署到 Windows，建议保持 `.venv` 与启动脚本路径一致
- 外部接口可能受网络环境影响，部署后如出现搜索失败，优先检查网络与代理
