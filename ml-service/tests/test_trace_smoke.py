"""T2: trace_smoke reports exit codes and never prints key values."""
from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from observability import tracing
from scripts import trace_smoke


@pytest.fixture(autouse=True)
def _reset():
    tracing.shutdown_tracing()
    yield
    tracing.shutdown_tracing()


def test_absent_keys_exit_2_and_names_them():
    res = trace_smoke.run(env={"LANGFUSE_HOST": "http://x"})
    assert res["exit"] == 2 and "LANGFUSE_PUBLIC_KEY" in res["reason"] and "LANGFUSE_SECRET_KEY" in res["reason"]
    assert res["vars_present"] == {"LANGFUSE_PUBLIC_KEY": False, "LANGFUSE_SECRET_KEY": False, "LANGFUSE_HOST": True}


def _serve(status):
    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            self.send_response(status)
            self.end_headers()

        def log_message(self, *a):
            pass
    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


@pytest.mark.parametrize("status,code", [(200, 0), (401, 3)])
def test_exit_codes_and_no_secret_in_result(status, code):
    srv = _serve(status)
    try:
        env = {"LANGFUSE_PUBLIC_KEY": "pk-ZZPUBVAL", "LANGFUSE_SECRET_KEY": "sk-ZZSECVAL",
               "LANGFUSE_HOST": f"http://127.0.0.1:{srv.server_port}"}
        res = trace_smoke.run(env=env)
    finally:
        srv.shutdown()
    assert res["exit"] == code and res["http_status"] == status
    assert "ZZPUBVAL" not in str(res) and "ZZSECVAL" not in str(res)
