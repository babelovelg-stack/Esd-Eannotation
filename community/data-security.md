# Esd-Eannotation 数据安全披露

## 中文说明

Esd-Eannotation 仅在 Figma 内运行，不会将数据发送到外部服务。`manifest.json` 声明 `networkAccess.allowedDomains` 为 `["none"]`。

插件为现有标注关联和完整性维护，会扫描当前页面的标注节点；当用户粘贴 Figma 节点链接时，会在当前文件中按节点 ID 定位设计稿。除此之外，插件根据当前单选节点及用户在 UI 中主动提供的内容工作。

插件可能读取：

- 当前选中节点的名称、类型、尺寸、父级上下文，以及布局、约束、最小/最大尺寸、填充、描边、圆角、padding、gap、文字样式、文字颜色、变量和样式引用。
- 用户输入的文本说明。
- 用户上传或粘贴的本地图片字节，用于在当前 Figma 文件中创建图片填充。

插件会在当前页面或 Section 中创建可见的标注卡片、图片节点、文字节点和局部编号徽标，并只在其创建的节点上写入有限 plugin data（类型、模式、编号、源节点 ID、标签和警告级别），以识别已有标注和追加内容。所有生成节点、图片和该有限数据均留在用户的 Figma 文件中，直到用户删除。

插件不会发送网络请求、上传文件或图层信息、调用第三方服务、使用分析或追踪、使用 `figma.clientStorage`，或在 Figma 外保存数据。当前仅支持单选，也不会创建或替代 Figma 原生 Annotations。

## English supplementary disclosure

Esd-Eannotation runs only inside Figma and sends no data to external services. Its manifest declares `networkAccess.allowedDomains` as `["none"]`.

For existing-annotation association and integrity maintenance, it scans annotation nodes on the current page. When a user pastes a Figma node link, it resolves that node ID within the current file. Otherwise, it works from the single selected node and content that the user explicitly supplies in the UI.

It may read the selected node’s name, type, size, parent context, layout, constraints, min/max size, fills, strokes, radius, padding, gap, typography, text color, variable and style references; user-entered text; and local or pasted image bytes used to create image fills in the current Figma file.

It creates visible annotation cards, image nodes, text nodes, and numbered local badges on the current page or Section. It stores limited plugin data only on nodes it creates—type, mode, number, source-node ID, tag, and warning level—to recognize and append existing annotations. This data and all created content remain in the user’s Figma file until deleted.

It makes no network requests, uploads no file or layer information, uses no third-party services, analytics, tracking, or `figma.clientStorage`, and stores nothing outside Figma. It currently supports single selection only and does not create or replace native Figma Annotations.

## 发布表单建议答案

- Access user-generated content? Yes, only the selected node, user-provided annotation content, and current-page annotation nodes needed for association.
- Send data outside Figma? No.
- Use third-party services, analytics, or tracking? No.
- Store data outside Figma? No.
- Network access? No access to network.
