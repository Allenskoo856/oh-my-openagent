# Oh My OpenCode

默认 README 已切换为中文。

[简体中文详细版](README.zh-cn.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

## 项目简介

`oh-my-opencode` 是一个面向 OpenCode 的增强插件，提供：

- 多智能体编排
- `ultrawork` / `ulw` 强执行工作流
- LSP、AST-Grep、Tmux、MCP 等工具集成
- Hashline 编辑保护
- Claude Code 兼容能力

如果你想看完整介绍、能力说明和背景内容，请直接阅读：

- [中文完整版 README](README.zh-cn.md)
- [安装指南](docs/guide/installation.md)

## 安装

### 常规安装

复制下面这段提示词给你的 Agent：

```text
Install and configure oh-my-opencode by following the instructions here:
https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/docs/guide/installation.md
```

如果你要自己安装，也可以直接运行：

```bash
bunx oh-my-opencode install
```

### Linux x64 离线安装

这个分支已经配置了 GitHub Actions，可以在发布后直接生成 Linux x64 离线安装包。

触发方式有两种：

1. 正式发布：

```bash
git tag v3.17.2
git push origin v3.17.2
```

2. 直接推当前工作分支：

```bash
git push origin codex/v3.17.2-musl-fallback
```

第二种会生成一个 branch-specific prerelease，并把离线安装包挂到 GitHub Releases。

离线包文件名类似：

```text
oh-my-opencode-offline-linux-x64-3.17.2.tar.gz
```

目标机器安装步骤：

```bash
tar -xzf oh-my-opencode-offline-linux-x64-<version>.tar.gz
cd oh-my-opencode-offline-linux-x64-<version>
./install.sh
```

默认安装目录：

```text
~/.config/opencode
```

如果你要改安装目录：

```bash
OPENCODE_CONFIG_DIR=/path/to/opencode ./install.sh
```

离线包内默认包含：

- `oh-my-opencode`
- `oh-my-opencode-linux-x64`
- `oh-my-opencode-linux-x64-baseline`
- `oh-my-opencode-linux-x64-musl-baseline`

安装后建议在目标机关闭遥测：

```bash
export OMO_SEND_ANONYMOUS_TELEMETRY=0
export OMO_DISABLE_POSTHOG=1
```

## 兼容性说明

- 发布包名和 CLI 名仍然是 `oh-my-opencode`
- `opencode.json` 里的插件入口优先使用 `oh-my-openagent`
- 旧的 `oh-my-opencode` 插件入口仍在兼容期内可识别

## 进一步阅读

- [中文完整版 README](README.zh-cn.md)
- [安装指南](docs/guide/installation.md)
- [功能参考](docs/reference/features.md)
- [CLI 参考](docs/reference/cli.md)
