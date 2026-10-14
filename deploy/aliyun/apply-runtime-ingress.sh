#!/bin/bash
set -euo pipefail
cd /opt/tuominwang
cp incoming/ingress-location.conf ingress-location.conf
cp incoming/apply-ingress.py apply-ingress.py
python3 apply-ingress.py
backup=/opt/tuominwang/backups/ingress-20261013
container=weknora-semantica-frontend-1
docker compose --env-file /opt/weknora-semantica/.env --project-directory /opt/weknora-semantica -f proposed-weknora-compose.yaml config --quiet
rollback() {
  docker cp "$backup/nginx-effective.conf" "$container:/etc/nginx/conf.d/default.conf"
  cp "$backup/nginx-template.conf" /opt/weknora-semantica/nginx.conf
  cp "$backup/compose.yaml" /opt/weknora-semantica/compose.yaml
  docker exec "$container" nginx -t && docker exec "$container" nginx -s reload
  docker network disconnect tuominwang-ingress "$container" || true
}
trap 'rollback' ERR
docker network connect tuominwang-ingress "$container"
docker cp proposed-nginx-effective.conf "$container:/etc/nginx/conf.d/default.conf"
docker exec "$container" nginx -t
cp proposed-nginx-template.conf /opt/weknora-semantica/nginx.conf
cp proposed-weknora-compose.yaml /opt/weknora-semantica/compose.yaml
docker exec "$container" nginx -s reload
ready=0
for attempt in 1 2 3 4 5 6 7 8; do
  if curl -fsS --resolve 182.92.172.59:443:127.0.0.1 https://182.92.172.59/tuomin/api/health -o backups/tuomin-health-current.json && python3 - <<'PY'
import json,sys
try:
    d=json.load(open('backups/tuomin-health-current.json'))
    valid=d.get('status')=='ok' and d.get('layers',{}).get('rules')=='ready' and d.get('layers',{}).get('ner')=='ready'
except Exception:
    valid=False
sys.exit(0 if valid else 1)
PY
  then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
curl -fsS --resolve 182.92.172.59:443:127.0.0.1 https://182.92.172.59/ -o backups/weknora-root-after.html
cmp backups/weknora-root-before.html backups/weknora-root-after.html
trap - ERR
printf '\nHTTPS /tuomin online; original homepage byte-for-byte preserved.\n'
