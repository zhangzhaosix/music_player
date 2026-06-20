# qeecc 备用源自动切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When qeecc search is blocked or returns empty results, `/api/search` should automatically fall back to Jamendo and still return the same `{"results":[...]}` shape.

**Architecture:** Keep qeecc as the primary source and add a small fallback layer in `app.py`. The backend will try qeecc first, then Jamendo if qeecc fails, is rate-limited, or yields no usable results. The frontend stays unchanged because the response schema remains the same.

**Tech Stack:** Flask, requests, BeautifulSoup4, Jamendo public API.

---

### Task 1: Add Jamendo search helper

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Add a Jamendo search helper**

```python
JAMENDO_API_BASE = 'https://api.jamendo.com/v3.0'
JAMENDO_CLIENT_ID = os.environ.get('JAMENDO_CLIENT_ID', '').strip()

def search_jamendo(keyword, limit=20):
    if not JAMENDO_CLIENT_ID:
        return []

    params = {
        'client_id': JAMENDO_CLIENT_ID,
        'format': 'json',
        'limit': limit,
        'search': keyword,
        'audioformat': 'mp32',
        'include': 'musicinfo',
    }
    resp = requests.get(f'{JAMENDO_API_BASE}/tracks/', params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    results = []
    for item in data.get('results', []):
        title = str(item.get('name', '')).strip()
        artist = str(item.get('artist_name', '')).strip()
        url = str(item.get('audio', '')).strip() or str(item.get('audiodownload', '')).strip()
        if not title or not url:
            continue
        results.append({
            'id': f"jamendo:{item.get('id')}",
            'title': title,
            'artist': artist or '未知歌手',
            'url': url,
            'source': 'jamendo',
        })
    return results
```

- [ ] **Step 2: Run a syntax check**

Run: `C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile app.py`
Expected: exit code `0`

### Task 2: Add fallback logic to `/api/search`

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Extend `search_qeecc()` to fall back to Jamendo**

```python
def search_qeecc(keyword):
    cached_results = get_cached_search_results(keyword)
    if cached_results is not None:
        return cached_results

    results = []
    qeecc_error = None

    try:
        # existing qeecc fetch + parse logic
        results = qeecc_results
    except Exception as e:
        qeecc_error = e

    if not results:
        try:
            jamendo_results = search_jamendo(keyword)
            if jamendo_results:
                store_search_results(keyword, jamendo_results)
                return jamendo_results
        except Exception:
            pass

    if qeecc_error:
        raise qeecc_error
    return results
```

- [ ] **Step 2: Keep blocked-page behavior strict**

```python
if blocked_page_detected:
    jamendo_results = search_jamendo(keyword)
    if jamendo_results:
        store_search_results(keyword, jamendo_results)
        return jamendo_results
    return {'error': '搜索页面返回了安全验证内容，请稍后重试'}, 502
```

- [ ] **Step 3: Run a fallback behavior test**

Run: a local stub that forces qeecc to return the security-verification path and verifies Jamendo results are returned when Jamendo stub data exists.
Expected: `/api/search` returns a non-empty `results` list from the fallback path.

### Task 3: Document the Jamendo client ID requirement

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a short configuration note**

```markdown
### 备用搜索源

当 qeecc 搜索被安全验证拦截时，后端会自动切换到 Jamendo 备用源。

需要配置环境变量：

```bash
JAMENDO_CLIENT_ID=你的client_id
```
```

- [ ] **Step 2: Run a README consistency check**

Run: manually verify the README mentions the fallback source and the required env var.
Expected: the new configuration is discoverable without changing the frontend.

### Task 4: Verify end-to-end behavior

**Files:**
- Modify: `app.py`
- Modify: `README.md`

- [ ] **Step 1: Compile the backend**

Run: `C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile app.py`
Expected: exit code `0`

- [ ] **Step 2: Run a local stub test for both sources**

Run: a script that stubs qeecc to fail and Jamendo to return one track.
Expected: `search_qeecc()` returns the Jamendo track and preserves the existing response schema.

- [ ] **Step 3: Confirm no frontend changes are required**

Check: `static/app.js` still reads `data.results` from `/api/search`.
Expected: no UI code changes are needed for the fallback.
