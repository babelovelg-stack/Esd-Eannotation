# Esd-Eannotation Figma Community 发布检查清单

## 代码和 manifest

- [ ] 确认 `manifest.json` 的 `id` 为 `1671594491317346512`，且指向 `dist/main.js` 和 `dist/ui.html`。
- [ ] 确认插件名称为 `Esd-Eannotation`，relaunch 标签为 `Open Esd-Eannotation`，`editorType` 为 `["figma"]`。
- [ ] 确认 `networkAccess.allowedDomains` 为 `["none"]`。
- [ ] 运行品牌兼容性校验：

  ```bash
  pnpm check:brand-compat
  ```

## 自动检查

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## Figma 手动验收

- [ ] 无选择时显示「请选择设计文件中的元素」；多选时要求只选择一个元素。
- [ ] 顶层元素创建全局卡片且不创建 badge；Frame 内元素创建局部卡片和源节点右上角 badge。
- [ ] 全局卡片图层名为 `Eannotation / <被标注元素名称>`；局部卡片图层名为 `Eannotation / <最外层画布名称>`。
- [ ] 修改源元素或最外层画布名称后，追加内容或重新打开插件会刷新卡片名；源元素缺失时保留旧名称。
- [ ] 局部卡片位于最外层 Frame 右侧；Section 内生成的节点仍保留在该 Section 内。
- [ ] 同一元素重复创建时追加内容，不重复创建 badge。
- [ ] 本地上传和剪贴板图片保持原始比例。
- [ ] 属性默认不勾选，且只生成用户勾选的属性；变量优先于样式，样式优先于原始值。
- [ ] 当前仅支持单选；不会创建或替代 Figma 原生 Annotations。

## Community 发布页

- [ ] Name: `Esd-Eannotation`
- [ ] Tagline: `在画布上生成结构化设计交付卡片`
- [ ] Category: `Design tools`
- [ ] Description: 使用 `listing-copy.md` 的中文说明；英文可使用其 supplementary description。
- [ ] Icon: `community/assets/icon-128.png`
- [ ] 插件 UI 与 Community icon 均显示同一黑白像素女孩 Logo。
- [ ] Thumbnail: `community/assets/thumbnail-1920x1080.png`
- [ ] Carousel:
  - `community/assets/carousel-01-core.png`
  - `community/assets/carousel-02-workflow.png`
  - `community/assets/carousel-03-boundaries.png`
- [ ] 在 Figma Community 发布表单中填写真实可用的支持方式；本仓库不提供虚构联系信息。

## 数据安全与提交

- [ ] 数据安全披露与 `data-security.md`、`privacy-policy.md` 保持一致。
- [ ] 发布页显示无网络访问；说明当前页扫描、当前文件链接解析、有限 plugin data、可见节点创建及单选限制。
- [ ] 提交前确认不承诺未实现功能；如以后加入网络请求、账号、AI 或外部存储，先更新本披露与隐私说明。
