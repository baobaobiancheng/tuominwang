# 复核实体重复槽位：对抗审查与实际修复验收

两项 P2 均已关闭；原始反例和源字节 hash 保留。

|问题|原实证|修复与验收|
|---|---|---|
|A-PROVENANCE-SLOT-01|同span/type删除一个槽位串用另一槽历史|真实markIndex绑定、whole-record优先、服务端当前opaqueID一对一；歧义需ID，foreign/重复ID拒409|
|A-PROVENANCE-SLOT-02|fresh ID与明确保留old1→new0的槽ID碰撞|fresh分配预留所有保留/历史/删除ID；纯helper及真实重复槽位接口通过|

真实隔离接口1PASS8.968s；C独立3文件13tests PASS393ms。提示ID仅传输，保存后剥离；改类型/范围保真事件由服务端真实actor产生。20,000条批量更新使用索引，避免全数组两两匹配。Root几何transform新增后独立复读确认重新验证frame再加密，不给未变几何制造事件。

精确日志/源码/前后反例SHA与限定见同名JSON。没有将普通pending历史保存当accepted快照。
