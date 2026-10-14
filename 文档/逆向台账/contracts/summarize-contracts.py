# coding: utf-8
import csv
import hashlib
import json
import io
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
source = ROOT / '.data/research/lawbot-2026-10-13/ipc-static-contracts.json'
data = json.loads(source.read_text())
functions = {f['id']: f for f in data['functions']}
rows = []
index = []
outputs = {}
def output(name, content):
    outputs[name] = content.encode('utf-8')
for c in data['channels']:
    handlers = [functions[h['functionId']] for h in c['handlers']]
    entry = {
        'id': c['id'], 'channel': c['channel'], 'historical': c['historical'],
        'operations': c['operations'], 'preloadExposures': c['preloadExposures'],
        'handlers': [{k: f.get(k, []) for k in ['id', 'evidence', 'parameters', 'parameterAccesses', 'capturedParameterAccesses', 'parameterDestructuring', 'returns', 'throws', 'catches', 'mutations', 'controlConditions']} for f in handlers],
        'eventEmissions': c['eventEmissions'],
        'directActivationCalls': [{'callee': call['callee'], 'evidence': call['evidence']} for f in handlers for call in f['calls'] if 'assertActivated' in call['callee']],
        'resolvedLexicalFunctionCount': len(c['directLexicalReachableFunctions']),
        'unresolvedCallCount': len(c['unresolvedCalls']), 'complete': False,
        'remaining': c['staticAssessment']['gaps'],
    }
    index.append(entry)
    rows.append([c['id'], c['channel'], '历史214' if c['historical'] else '新增', len(handlers), len(c['preloadExposures']), len(c['eventEmissions']), len(c['directLexicalReachableFunctions']), len(c['unresolvedCalls']), 'R0', '局部契约；未全链闭合'])
with io.StringIO(newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['稳定ID', '通道', '来源', '处理器数', 'preload操作数', '推送位置数', '词法可达函数数', '未解析调用数', '竞品运行', '结论'])
    writer.writerows(rows)
    output('IPC逐项概览.csv', '\ufeff' + f.getvalue())
output('ipc-contract-index.json', json.dumps({'source': str(source.relative_to(ROOT)), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'channels': index}, ensure_ascii=False, indent=2) + '\n')
gateway = []
for method in data['gatewayServiceMethods']:
    gateway.append({**method, 'contracts': [functions[c['functionId']] for c in method['candidates']]})
output('gateway-service-contracts.json', json.dumps({'source': str(source.relative_to(ROOT)), 'note': '13个service方法；第14个gateway_ping直接在ux返回。方法定位并非服务类型绑定或完整链路证明。', 'methods': gateway}, ensure_ascii=False, indent=2) + '\n')
recommendations = []
for c, entry in zip(data['channels'], index):
    handlers = entry['handlers']
    fields = sorted(set(a['expression'] for h in handlers for a in h['parameterAccesses'] + h['capturedParameterAccesses']))
    return_count = sum(len(h['returns']) for h in handlers)
    throw_count = sum(len(h['throws']) for h in handlers)
    local = c['staticAssessment']['level'] != 'declaration-only'
    recommendations.append({
        'id': c['id'], 'name': c['channel'], 'recommendedStaticDepth': 'S2' if local else 'S1',
        'reason': '有处理器输入/返回/错误及调用位置的局部契约证据；不代表类型或调用链完整。' if handlers else '通知事件已有主进程推送载荷及preload订阅/取消订阅位置；无需请求handler。',
        'summary': (f"处理器{len(handlers)}处；观察参数访问{len(fields)}项、直接返回{return_count}处、显式throw {throw_count}处；词法可达函数{entry['resolvedLexicalFunctionCount']}，未解析调用{entry['unresolvedCallCount']}。" if handlers else f"通知通道；preload操作{len(c['preloadExposures'])}处，推送{len(c['eventEmissions'])}处，非缺失请求处理器。"),
        'observedParameterAccesses': fields,
        'gaps': (['属性访问/解构不等于必填或完整输入Schema', '嵌套捕获已记录，但回调执行、参数别名、动态分派及外部依赖未闭合', '返回/错误仅语法分支，异常传播及持久副作用/恢复仍待核'] if handlers else ['订阅注册和发送点已找到；所有生产者的执行条件及真实交付/清理仍未运行验证']) + ['未逐项运行竞品；R0保持', '没有完整静态链路S3建议'],
        'evidence': [o['evidence'] for o in c['operations']], 'runtimeRecommendation': 'R0',
    })
output('ledger-recommendations.json', json.dumps({'note': '逐项S2仅表示已有局部契约/事件关系证据，不能批量宣称完整；由父代理审查后合并。', 'channels': recommendations}, ensure_ascii=False, indent=2) + '\n')
checking = '--check' in sys.argv
if checking:
    stale = [name for name, content in outputs.items() if not (HERE / name).is_file() or (HERE / name).read_bytes() != content]
    if stale: raise SystemExit('Derived contracts are stale: ' + ', '.join(stale))
else:
    for name, content in outputs.items(): (HERE / name).write_bytes(content)
print(json.dumps({'status': 'passed', 'mode': 'check' if checking else 'generate', 'channels': len(index), 'gatewayServiceMethods': len(gateway), 'artifactHashes': {str((HERE / name).relative_to(ROOT)): hashlib.sha256(content).hexdigest() for name, content in outputs.items()}}))
