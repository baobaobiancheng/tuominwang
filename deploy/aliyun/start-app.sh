#!/bin/bash
set -euo pipefail
cd /opt/tuominwang
curl -fsS --resolve 182.92.172.59:443:127.0.0.1 https://182.92.172.59/ -o backups/weknora-root-before.html
sha256sum backups/weknora-root-before.html
(cd incoming && sha256sum -c artifacts.sha256)
docker load -i incoming/runtime-amd64.tar.gz
docker load -i incoming/web-amd64.tar.gz
test "$(docker image inspect tuominwang-runtime:aliyun-20261013 --format '{{.Architecture}}')" = amd64
test "$(docker image inspect tuominwang-web:aliyun-20261013 --format '{{.Architecture}}')" = amd64
tar -xzf incoming/models.tar.gz
python3 - <<'PY'
from pathlib import Path
import json,hashlib
root=Path('models')
m=json.loads((root/'manifest.json').read_text())
assert m['privateAI']=='not_included'
for relative,expected in m['files'].items():
    path=(root/relative).resolve()
    path.relative_to(root.resolve())
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    assert h.hexdigest()==expected, relative
print('Model bundle hashes verified.')
PY
docker compose run --rm --no-deps migrate
docker compose run --rm --no-deps -v "$PWD/bootstrap-account.ts:/app/cloud-bootstrap.ts:ro" admin node /app/cloud-bootstrap.ts
docker compose up -d --pull never --wait --wait-timeout 120 api worker web
curl -fsS http://127.0.0.1:5189/tuomin/api/health
