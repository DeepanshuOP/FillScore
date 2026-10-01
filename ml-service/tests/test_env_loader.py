"""Env loading precedence (audit finding F1).

A stale MONGODB_URI in ml-service/.env used to shadow the one in backend/.env, so the
council authenticated against Mongo with the wrong credentials. Shared keys now come from
backend/.env; real process environment variables always win over both files.
"""
from config.env_loader import load_service_env, SHARED_KEYS


def _write(path, lines):
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_mongodb_uri_is_shared_and_prefers_backend_file(tmp_path):
    ml = tmp_path / "ml.env"
    backend = tmp_path / "backend.env"
    _write(ml, ["MONGODB_URI=mongodb://stale-host/old", "GROQ_API_KEY=groq-from-ml"])
    _write(backend, ["MONGODB_URI=mongodb://good-host/fillscore"])
    env: dict = {}

    load_service_env(str(ml), str(backend), environ=env)

    assert env["MONGODB_URI"] == "mongodb://good-host/fillscore"
    assert env["GROQ_API_KEY"] == "groq-from-ml"


def test_jwt_secret_is_shared_so_both_services_verify_the_same_tokens(tmp_path):
    assert "JWT_ACCESS_SECRET" in SHARED_KEYS
    assert "MONGODB_URI" in SHARED_KEYS
    ml = tmp_path / "ml.env"
    backend = tmp_path / "backend.env"
    _write(ml, ["JWT_ACCESS_SECRET=ml-copy"])
    _write(backend, ["JWT_ACCESS_SECRET=backend-copy"])
    env: dict = {}

    load_service_env(str(ml), str(backend), environ=env)

    assert env["JWT_ACCESS_SECRET"] == "backend-copy"


def test_real_environment_variables_beat_both_files(tmp_path):
    ml = tmp_path / "ml.env"
    backend = tmp_path / "backend.env"
    _write(ml, ["MONGODB_URI=mongodb://ml/x", "GROQ_API_KEY=ml-key"])
    _write(backend, ["MONGODB_URI=mongodb://backend/x"])
    env = {"MONGODB_URI": "mongodb://from-process/x", "GROQ_API_KEY": "from-process"}

    load_service_env(str(ml), str(backend), environ=env)

    assert env["MONGODB_URI"] == "mongodb://from-process/x"
    assert env["GROQ_API_KEY"] == "from-process"


def test_service_specific_keys_prefer_the_ml_file(tmp_path):
    ml = tmp_path / "ml.env"
    backend = tmp_path / "backend.env"
    _write(ml, ["ALLOWED_ORIGINS=https://ml.example"])
    _write(backend, ["ALLOWED_ORIGINS=https://backend.example", "ENCRYPTION_KEY=abc"])
    env: dict = {}

    load_service_env(str(ml), str(backend), environ=env)

    assert env["ALLOWED_ORIGINS"] == "https://ml.example"
    assert env["ENCRYPTION_KEY"] == "abc"


def test_missing_and_malformed_files_do_not_crash(tmp_path):
    bad = tmp_path / "bad.env"
    bad.write_bytes(b"\xff\xfe\x00not utf8")
    env: dict = {}

    load_service_env(str(tmp_path / "nope.env"), str(bad), environ=env)

    assert env == {}


def test_returns_only_key_names_never_values(tmp_path):
    ml = tmp_path / "ml.env"
    _write(ml, ["GROQ_API_KEY=super-secret-value"])
    loaded = load_service_env(str(ml), str(tmp_path / "none.env"), environ={})

    assert loaded == ["GROQ_API_KEY"]
    assert "super-secret-value" not in repr(loaded)
