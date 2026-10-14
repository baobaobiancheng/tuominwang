#!/usr/bin/env python3
# coding: utf-8
import json,subprocess,time
from pathlib import Path
names=['tuominwang-aliyun-'+s+'-1' for s in ['api','worker','web','db']]+['weknora-semantica-'+s+'-1' for s in ['frontend','app','semantica','redis','postgres']]
metadata=json.loads(subprocess.check_output(['docker','inspect']+names))
containers=[]
for d in metadata:
    pid=d['State']['Pid']; cg=None; v2=False
    for line in Path('/proc/'+str(pid)+'/cgroup').read_text().splitlines():
        _,controllers,group=line.split(':',2)
        if 'memory' in controllers.split(','):
            cg=Path('/sys/fs/cgroup/memory'+group)
        elif controllers=='':
            cg=Path('/sys/fs/cgroup'+group);v2=True
    containers.append((d['Name'].lstrip('/'),cg,v2))
output=Path('/opt/tuominwang/memory-observation.jsonl')
with output.open('x') as f:
    for _ in range(600):
        now={'unixTime':time.time(),'containers':{}}
        host={}
        for line in Path('/proc/meminfo').read_text().splitlines():
            k,v=line.split(':',1);host[k]=int(v.strip().split()[0])
        now['availableKiB']=host['MemAvailable'];now['swapUsedKiB']=host['SwapTotal']-host['SwapFree']
        for name,cg,v2 in containers:
            try:
                stat={k:int(v) for k,v in (line.split() for line in (cg/'memory.stat').read_text().splitlines())}
                get=lambda n:int((cg/n).read_text()) if (cg/n).is_file() else None
                now['containers'][name]={'rssBytes':stat.get('anon') if v2 else stat.get('total_rss',stat.get('rss')),'usageBytes':get('memory.current' if v2 else 'memory.usage_in_bytes'),'lifetimePeakBytes':get('memory.peak' if v2 else 'memory.max_usage_in_bytes')}
            except Exception as e:now['containers'][name]={'error':type(e).__name__}
        f.write(json.dumps(now)+'\n');f.flush()
        if Path('/opt/tuominwang/monitor.stop').exists():break
        time.sleep(1)
print('Memory observation saved; cgroup usage includes cache, RSS recorded separately.')
