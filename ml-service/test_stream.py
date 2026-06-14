import urllib.request, json
from urllib.error import HTTPError
try:
    req = urllib.request.Request(
        'http://localhost:8000/ml/agents/council/stream',
        data=b'{"userId":"demo-aggressive","symbol":"BTCUSDT"}',
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        for i, line in enumerate(r):
            s = line.decode().strip()
            if s: print(s)
            if i > 50: break
except HTTPError as e:
    print('HTTPError:', e.code)
    print(e.read().decode())
