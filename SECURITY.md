# 安全策略

本项目的 `@aue/net`、`@aue/worker` 会处理来自网络和 Web Worker 的消息，`@aue/data`、`@aue/spine` 会解析外部数据文件。如果你发现可以让解析崩溃、越界读写、利用锁步双方状态分叉攻击对方，或在使用本引擎的页面里执行任意脚本等问题，请**不要公开发 issue**，而是通过 GitHub 的 [私下报告漏洞](https://github.com/ArknightsDevs/Arknights-Universal-Engine/security/advisories/new) 告诉我们，附上复现步骤。

我们会尽快确认并修复，修复发布后再公开说明。

只支持 `main` 分支的最新提交。
