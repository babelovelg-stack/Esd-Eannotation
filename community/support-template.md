# Esd-Eannotation 支持模板

支持邮箱：`yueqi@tsign.cn`

## 常见问题

### 为什么会显示空状态？

Esd-Eannotation 仅在 Figma 文件中选中一个元素后可用。请先选择一个图层、Frame、Component、Instance 或文字节点。

### 能同时标注多个元素吗？

暂不支持。Esd-Eannotation 当前仅支持单选，以可靠定位并关联一个源元素。

### 插件会把文件数据发送到其他地方吗？

不会。Esd-Eannotation 没有网络访问，也不会向外部服务发送数据。

### 为什么有些属性显示变量或样式名称，而不是原始值？

绑定变量时优先显示变量名称；没有变量但有样式时显示样式名称；仅在两者都不存在时显示原始值。

### 能为已有标注继续添加内容吗？

可以。再次选择同一源元素并创建标注，Esd-Eannotation 会将新内容追加到已有标注，而不是创建重复编号。

## English supplementary FAQ

Esd-Eannotation requires exactly one selected Figma node; multiple selection is not currently supported. It has no network access and sends no data to external services. Bound variables take priority over styles and raw values. Re-annotating the same source element appends content instead of creating a duplicate badge.

Support email: `yueqi@tsign.cn`

## 问题反馈模板

```text
Figma file context:
Selected node type:
Expected result:
Actual result:
Steps to reproduce:
Screenshot or screen recording:
Plugin version:
```
