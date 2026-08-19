# Esd-Eannotation 发布说明

## v1.1.0

### 改进

- 全局标注卡片现在使用被标注元素名称：`Eannotation / <元素名称>`。
- 局部标注卡片现在使用最外层 Frame、Component 或 Instance 名称：`Eannotation / <画布名称>`。
- 创建、追加内容、插件启动和局部标注重新编号时会同步最新名称；源元素缺失时保留旧名称。
- 插件 UI 与 Figma Community 图标统一为黑白像素女孩 Logo。
- 标注数据格式、编号规则、旧文件识别和无网络访问策略保持不变。

### English supplementary notes

Card layers now use their source canvas names: global cards use the annotated element name, while local cards use the outermost Frame, Component, or Instance name. Names are refreshed during creation, append, startup, and local renumbering, with existing names preserved when the source is missing. The plugin UI and Community icon now share the monochrome pixel-girl logo. Data compatibility, numbering, legacy recognition, and the no-network policy are unchanged.

## v1.0.0

Esd-Eannotation 首次公开发布。

### 已加入

- 为顶层 Figma 选择创建全局交付卡片。
- 为 Frame 内元素创建带编号徽标的局部卡片。
- 添加文字说明、本地图片和剪贴板图片，并保持图片比例。
- 输出宽高、最小/最大尺寸、填充、描边、文字样式、文字颜色、圆角和盒模型属性。
- 变量优先于样式，样式优先于原始值。
- 对同一源元素继续追加内容，避免重复编号。
- 无网络访问。

### 已知限制

- 当前仅支持单选。
- 标注样式基于当前版本生成，暂不可自定义。
- 不会创建或替代 Figma 原生 Annotations。

## English supplementary notes

Initial public release of Esd-Eannotation: global cards for top-level selections, numbered local cards for elements in Frames, text and local/clipboard images, selected property specs, variable/style priority, append-to-existing behavior, and no network access. Current limits: single selection only, generated styles are not configurable, and native Figma Annotations are not replaced.
