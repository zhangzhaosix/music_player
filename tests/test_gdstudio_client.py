import os
import sys
import tempfile
import threading
import unittest
import requests
from contextlib import closing
from email.utils import formatdate

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'code', 'backend'))
from gdstudio import GDStudioClient, retry_seconds


class Response:
    def __init__(self, status=200, body='[]', headers=None):
        self.status_code, self.text, self.headers = status, body, headers or {}

    def raise_for_status(self):
        pass

    def close(self):
        pass


class Session:
    def __init__(self):
        self.calls = []
        self.response = Response()

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


class GDStudioClientTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 1000
        self.session = Session()
        self.path = os.path.join(self.temp.name, 'state.sqlite')
        self.client = GDStudioClient(self.path, self.session, lambda: self.now)

    def test_rate_limit_is_shared_and_survives_restart(self):
        for _ in range(45):
            self.assertIsNone(self.client.request('search', name='x')[1])
        other = GDStudioClient(self.path, self.session, lambda: self.now)
        self.assertIn('约 2 分钟后重试', other.request('url', id='1')[1])
        self.assertEqual(len(self.session.calls), 45)
        self.now += 301
        self.assertIsNone(other.request('url', id='1')[1])
        self.assertEqual(self.session.calls[-1][1]['params']['source'], 'netease')

    def test_429_respects_retry_after(self):
        self.session.response = Response(429, headers={'Retry-After': '120'})
        self.assertIsNotNone(self.client.request('search')[1])
        self.session.response = Response()
        self.now += 119
        self.assertIsNotNone(self.client.request('lyric')[1])
        self.assertEqual(len(self.session.calls), 1)
        self.now += 2
        self.assertIsNone(self.client.request('lyric')[1])

    def test_retry_after_accepts_http_date(self):
        self.session.response = Response(429, headers={'Retry-After': formatdate(self.now + 90, usegmt=True)})
        self.client.request('search')
        self.session.response = Response()
        self.now += 89
        self.assertIsNotNone(self.client.request('search')[1])
        self.now += 2
        self.assertIsNone(self.client.request('search')[1])

    def test_invalid_retry_after_does_not_block_forever(self):
        self.assertEqual(retry_seconds('inf', self.now), 60)
        self.assertEqual(retry_seconds('invalid', self.now), 60)

    def test_403_and_captcha_stay_blocked_until_manual_resume(self):
        for response in (Response(403), Response(body='验证码')):
            self.session.response = response
            self.assertIsNotNone(self.client.request('search')[1])
            self.session.response = Response()
            other = GDStudioClient(self.path, self.session, lambda: self.now)
            self.assertIsNotNone(other.request('url')[1])
            other.resume()
            self.assertIsNone(self.client.request('url')[1])

    def test_song_title_containing_captcha_does_not_block(self):
        self.session.response = Response(body='[{"name":"验证码"}]')
        payload, error = self.client.request('search')
        self.assertIsNone(error)
        self.assertEqual(payload[0]['name'], '验证码')

    def test_block_reason_survives_restart_and_resume_preserves_evidence(self):
        self.session.response = Response(403)
        self.client.request('url', id='123')
        other = GDStudioClient(self.path, self.session, lambda: self.now)
        self.assertIn('GD 接口 url 返回 HTTP 403', other.request('search')[1])
        other.resume()
        self.session.response = Response()
        self.assertIsNone(other.request('search')[1])
        import sqlite3
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT at, reason FROM restriction').fetchone(),
                             (1000, 'GD 接口 url 返回 HTTP 403'))

    def test_parallel_clients_stop_after_first_403(self):
        entered, release = threading.Event(), threading.Event()
        def delayed_get(url, **kwargs):
            self.session.calls.append((url, kwargs))
            entered.set()
            release.wait(3)
            return Response(403)
        self.session.get = delayed_get
        other = GDStudioClient(self.path, self.session, lambda: self.now)
        first = threading.Thread(target=lambda: self.client.request('search'))
        second_result = []
        second = threading.Thread(target=lambda: second_result.append(other.request('url')))
        first.start()
        self.assertTrue(entered.wait(2))
        second.start()
        release.set()
        first.join(5)
        second.join(5)
        self.assertEqual(len(self.session.calls), 1)
        self.assertIn('拒绝', second_result[0][1])

    def test_background_reserves_capacity_for_foreground(self):
        for _ in range(25):
            self.assertIsNone(self.client.request('search', background=True)[1])
        self.assertIn('上限', self.client.request('search', background=True)[1])
        self.assertIsNone(self.client.request('url')[1])

    def test_timeout_does_not_retry_automatically(self):
        def timeout(url, **kwargs):
            self.session.calls.append((url, kwargs))
            raise requests.Timeout('slow')
        self.session.get = timeout
        self.assertIsNotNone(self.client.request('search')[1])
        self.assertEqual(len(self.session.calls), 1)

    def test_server_status_distinguishes_outage_timeout_and_recovery(self):
        self.session.response = Response(521)
        self.assertTrue(self.client.server_status())
        self.assertEqual(len(self.session.calls), 1)
        self.assertTrue(self.client.server_status())
        self.assertEqual(len(self.session.calls), 1)
        self.now += 60
        def timeout(*args, **kwargs):
            raise requests.Timeout('slow')
        self.session.get = timeout
        self.assertTrue(self.client.server_status())
        self.now += 60
        self.session.get = lambda *args, **kwargs: Response(body='{"error":"unavailable"}')
        self.assertTrue(self.client.server_status())
        self.now += 60
        self.session.get = lambda *args, **kwargs: Response()
        self.assertFalse(self.client.server_status())

    def test_local_failure_and_access_restriction_are_not_server_failure(self):
        def timeout(*args, **kwargs):
            raise requests.Timeout('slow')
        self.session.get = timeout
        self.assertIsNone(self.client.server_status())
        self.client.block('访问限制')
        self.now += 60
        self.assertIsNone(self.client.server_status())


if __name__ == '__main__':
    unittest.main()
