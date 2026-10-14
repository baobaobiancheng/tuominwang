#!/usr/bin/env python3
# coding: utf-8
"""Stage only our /tuomin route and ingress network; preserve every original byte."""
from pathlib import Path
import hashlib, subprocess
root=Path('/opt/tuominwang')
oldroot=Path('/opt/weknora-semantica')
fragment=(root/'ingress-location.conf').read_text()
marker='    # BEGIN TUOMINWANG INGRESS'
needle='    # 前端静态文件\n'
backup=root/'backups'/'ingress-20261013'
backup.mkdir(exist_ok=False)
template=oldroot/'nginx.conf'
assert hashlib.sha256(template.read_bytes()).hexdigest()=='0cb06324381d163c231b097864b0b4c265d3c7d7f4bd464529d48956754e3ee9', 'Existing ingress changed; inspect before patching'
current=subprocess.check_output(['docker','exec','weknora-semantica-frontend-1','cat','/etc/nginx/conf.d/default.conf'])
for name,original in [('nginx-template.conf',template.read_bytes()),('nginx-effective.conf',current)]:
    (backup/name).write_bytes(original)
    text=original.decode('utf-8')
    assert text.count(needle)==1 and marker not in text
    proposed=text.replace(needle,fragment+'\n'+needle,1)
    assert proposed.replace(fragment+'\n','',1)==text
    (root/('proposed-'+name)).write_text(proposed)
compose=oldroot/'compose.yaml'
original=compose.read_bytes()
(backup/'compose.yaml').write_bytes(original)
text=original.decode('utf-8')
assert 'networks:\n' not in text, 'Existing networks require manual reconciliation'
start=text.index('  frontend:\n'); insert=text.index('    volumes:\n',start)
updated=text[:insert]+'    networks: [default, tuominwang_ingress]\n'+text[insert:]
updated+='\nnetworks:\n  default:\n  tuominwang_ingress:\n    external: true\n    name: tuominwang-ingress\n'
(root/'proposed-weknora-compose.yaml').write_text(updated)
print('Staged ingress route and network. Existing root/API/assets bytes preserved; no running config changed.')
