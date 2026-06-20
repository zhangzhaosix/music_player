import unittest
from unittest.mock import patch

import requests

import app


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class QjjlbResilienceTests(unittest.TestCase):
    def setUp(self):
        app._search_cache.clear()

    def test_fetch_qjjlb_json_retries_once_after_connection_error(self):
        calls = {'count': 0}

        class FakeSession:
            def get(self, url, params=None, timeout=None):
                calls['count'] += 1
                if calls['count'] == 1:
                    raise requests.ConnectionError('Connection aborted.')
                return FakeResponse({'code': 200, 'data': []})

        with patch.object(app, 'get_qjjlb_session', return_value=FakeSession()):
            data, err = app.fetch_qjjlb_json('https://example.test/api')

        self.assertIsNone(err)
        self.assertEqual(data, {'code': 200, 'data': []})
        self.assertEqual(calls['count'], 2)

    def test_search_qjjlb_skips_failed_sources_and_returns_later_results(self):
        with patch.object(app, 'search_qjjlb_qq', return_value=(None, 'qq source failed')), \
             patch.object(app, 'search_qjjlb_kuwo', return_value=([{'id': 'kuwo-1'}], None)), \
             patch.object(app, 'search_qjjlb_netease', return_value=([], None)):
            results = app.search_qjjlb('起风了', limit=10)

        self.assertIsInstance(results, list)
        self.assertEqual(results, [{'id': 'kuwo-1'}])


if __name__ == '__main__':
    unittest.main()
