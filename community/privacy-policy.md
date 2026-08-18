# Esd-Eannotation 隐私说明

生效日期：2026 年 8 月 18 日  
Effective date: August 18, 2026

发布者 / Publisher：越祈  
联系邮箱 / Contact：yueqi@tsign.cn

## 中文说明

Esd-Eannotation 是用于创建设计交付卡片的 Figma 插件。它仅在 Figma 内运行，不会将数据发送至外部服务。

### 访问的数据

插件可能访问当前选中节点及相关属性，包括名称、类型、尺寸、父级上下文、布局、约束、最小/最大尺寸、填充、描边、文字属性、变量、样式、圆角、间距和盒模型值。插件也会处理用户主动输入的文本，以及用户上传或粘贴的本地图片。

为识别和维护已有标注关联，插件会扫描当前页面的标注节点；当用户粘贴 Figma 节点链接时，会在当前文件中按节点 ID 定位设计稿。

### 使用与存储

上述数据仅用于在当前 Figma 文件中创建可见的标注卡片、图片节点、文字节点和局部编号徽标。插件只在其创建的节点上写入有限 plugin data（类型、模式、编号、源节点 ID、标签和警告级别），以便识别已有标注并追加内容。创建的节点、图片及该数据均保留在用户的 Figma 文件中，直至用户删除；插件不在 Figma 外存储用户数据。

### 共享与网络

插件不向外部服务器、第三方 API、分析工具或广告服务传输用户数据。`manifest.json` 声明无网络访问（`allowedDomains: ["none"]`）。插件当前仅支持单选，不会创建或替代 Figma 原生 Annotations。

如对本政策或插件的数据处理方式有疑问，请联系 `yueqi@tsign.cn`。

## English supplementary notice

Esd-Eannotation is a Figma plugin for creating design handoff cards. It runs only inside Figma and sends no data to external services.

### Data accessed

The plugin may access the currently selected node and related properties, including name, type, size, parent context, layout, constraints, min/max size, fills, strokes, text properties, variables, styles, radius, spacing, and box-model values. It also processes text explicitly entered by the user and local images uploaded or pasted by the user.

To recognize and maintain existing annotation associations, it scans annotation nodes on the current page. When a user pastes a Figma node link, it resolves the node ID in the current file.

### Use and storage

This information is used only to create visible annotation cards, image nodes, text nodes, and numbered local badges in the current Figma file. Limited plugin data—type, mode, number, source-node ID, tag, and warning level—is stored only on nodes that the plugin creates so it can recognize and append existing annotations. Created nodes, images, and this data remain in the user’s Figma file until deleted; the plugin stores no user data outside Figma.

### Sharing and network access

The plugin does not transmit data to external servers, third-party APIs, analytics tools, or advertising services. `manifest.json` declares no network access (`allowedDomains: ["none"]`). The plugin currently supports single selection only and does not create or replace native Figma Annotations.

For questions about this policy or the plugin's data practices, contact `yueqi@tsign.cn`.
