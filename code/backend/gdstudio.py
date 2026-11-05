"""GD 音乐台 API 请求控制，供搜索、播放、歌词与封面共用。"""

import json
import logging
import math
import os
import sqlite3
import threading
import time
from contextlib import closing
from contextlib import contextmanager
from email.utils import parsedate_to_datetime

import requests

API_URL = 'https://music-api.gdstudio.xyz/api.php'


def retry_seconds(value, now):
    try:
        seconds = float(value)
    except (ValueError, TypeError):
        try:
            seconds = parsedate_to_datetime(value).timestamp() - now
        except (ValueError, TypeError, OverflowError):
            seconds = 60
    return max(1, seconds) if math.isfinite(seconds) else 60


@contextmanager
def process_lock(path):
    with open(path, 'a+b') as handle:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


class GDStudioClient:
    def __init__(self, state_file, session=None, clock=time.time):
        self.state_file = state_file
        self.session = session or requests.Session()
        self.clock = clock
        self.lock = threading.Lock()
        os.makedirs(os.path.dirname(os.path.abspath(state_file)), exist_ok=True)
        with closing(sqlite3.connect(self.state_file)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS requests (at REAL NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, blocked INTEGER NOT NULL, cooldown REAL NOT NULL)')
            db.execute('INSERT OR IGNORE INTO state VALUES (1, 0, 0)')
            db.execute('CREATE TABLE IF NOT EXISTS restriction (id INTEGER PRIMARY KEY, at REAL NOT NULL, reason TEXT NOT NULL)')

    def _record_restriction(self, db, reason):
        db.execute('INSERT OR REPLACE INTO restriction VALUES (1, ?, ?)', (self.clock(), reason))
        logging.getLogger(__name__).warning('GD access paused: %s', reason)

    def resume(self):
        with self.lock, process_lock(self.state_file + '.lock'), closing(sqlite3.connect(self.state_file)) as db, db:
            db.execute('UPDATE state SET blocked=0 WHERE id=1')

    def block(self, reason='音频服务器拒绝访问'):
        with self.lock, process_lock(self.state_file + '.lock'), closing(sqlite3.connect(self.state_file)) as db, db:
            db.execute('UPDATE state SET blocked=1 WHERE id=1')
            self._record_restriction(db, reason)

    def cooldown(self, retry_after):
        seconds = retry_seconds(retry_after, self.clock())
        with self.lock, process_lock(self.state_file + '.lock'), closing(sqlite3.connect(self.state_file)) as db, db:
            db.execute('UPDATE state SET cooldown=MAX(cooldown, ?) WHERE id=1', (self.clock() + max(1, seconds),))

    def access_error(self):
        try:
            with closing(sqlite3.connect(self.state_file, timeout=5)) as db:
                blocked, cooldown = db.execute('SELECT blocked, cooldown FROM state WHERE id=1').fetchone()
                if blocked:
                    return 'GD 音乐台已拒绝访问，请确认限制解除后手动恢复'
                if cooldown > self.clock():
                    return 'GD 音乐台请求受限，请稍后重试'
        except (OSError, sqlite3.Error):
            return 'GD 音乐台请求队列不可用，请稍后重试'
        return None

    def request(self, kind, *, background=False, **params):
        try:
            return self._request(kind, background=background, **params)
        except (OSError, sqlite3.Error) as exc:
            logging.getLogger(__name__).warning('GD 音乐台请求队列不可用 error=%s', type(exc).__name__)
            return None, 'GD 音乐台请求繁忙，请稍后重试'

    def _request(self, kind, *, background=False, **params):
        started = self.clock()
        with self.lock, process_lock(self.state_file + '.lock'), closing(sqlite3.connect(self.state_file, timeout=5)) as db, db:
            db.execute('BEGIN IMMEDIATE')
            now = self.clock()
            blocked, cooldown = db.execute('SELECT blocked, cooldown FROM state WHERE id=1').fetchone()
            db.execute('DELETE FROM requests WHERE at <= ?', (now - 300,))
            count = db.execute('SELECT COUNT(*) FROM requests').fetchone()[0]
            if blocked:
                record = db.execute('SELECT reason FROM restriction WHERE id=1').fetchone()
                reason = record[0] if record else '历史暂停记录（未记录触发原因）'
                return None, 'GD 音乐台已拒绝访问：%s；请确认限制解除后手动恢复' % reason
            if cooldown > now:
                return None, 'GD 音乐台请求受限，请稍后重试'
            if count >= (25 if background else 30 if kind == 'pic' else 45):
                return None, 'GD 音乐台请求频率已达安全上限，请约 2 分钟后重试'
            db.execute('INSERT INTO requests VALUES (?)', (now,))
            db.commit()
            response = None
            stage = 'request'
            try:
                response = self.session.get(API_URL, params={'types': kind, 'source': 'netease', **params}, timeout=(3, 8))
                stage = 'http_%s' % response.status_code
                if response.status_code == 403:
                    db.execute('UPDATE state SET blocked=1 WHERE id=1')
                    self._record_restriction(db, 'GD 接口 %s 返回 HTTP 403' % kind)
                    return None, 'GD 音乐台拒绝访问，请确认限制解除后手动恢复'
                if response.status_code == 429:
                    seconds = retry_seconds(response.headers.get('Retry-After', ''), self.clock())
                    db.execute('UPDATE state SET cooldown=MAX(cooldown, ?) WHERE id=1', (self.clock() + seconds,))
                    return None, 'GD 音乐台请求受限，请稍后重试'
                response.raise_for_status()
                body = response.text
                stage = 'decode'
                try:
                    payload = json.loads(body)
                except ValueError:
                    if any(word in body.lower() for word in ('captcha', '验证码', '人机验证')):
                        db.execute('UPDATE state SET blocked=1 WHERE id=1')
                        self._record_restriction(db, 'GD 接口 %s 要求验证' % kind)
                        return None, 'GD 音乐台要求验证，请确认限制解除后手动恢复'
                    raise
                message = ' '.join(str(payload.get(key, '') or '') for key in ('error', 'message', 'msg')) if isinstance(payload, dict) else ''
                if any(word in message.lower() for word in ('captcha', '验证码', '人机验证')):
                    db.execute('UPDATE state SET blocked=1 WHERE id=1')
                    self._record_restriction(db, 'GD 接口 %s 要求验证' % kind)
                    return None, 'GD 音乐台要求验证，请确认限制解除后手动恢复'
                return payload, None
            except (requests.RequestException, ValueError) as exc:
                logging.getLogger(__name__).warning('GD 音乐台请求失败 stage=%s error=%s', stage, type(exc).__name__)
                return None, 'GD 音乐台暂时不可用，请稍后重试'
            finally:
                if response is not None:
                    response.close()
                logging.getLogger(__name__).info('GD 音乐台 type=%s stage=%s elapsed=%.3f', kind, stage, self.clock() - started)
