# Esd-Eannotation Design Specification

## Plugin UI

- UI framework: React + TypeScript + Vite + shadcn preset `b6rtC1Td2`.
- Theme tokens come from the Scatter canvas `:root` and `.dark` OKLCH variables in `src/index.css`.
- Empty state copy: `请选择设计文件中的元素`.
- Multi-select copy: `请只选择一个元素`.
- Attribute options are unchecked by default.
- Attribute options are displayed as a checkbox list with labels only; detailed property values are generated on the canvas after submission.

## Annotation Type

- Global annotation: selected node has no outer frame-like ancestor except page/section.
- Local annotation: selected node has an outer `FRAME`, `COMPONENT`, or `INSTANCE` ancestor.
- `SECTION` is ignored for type detection but used as the parent container for created annotation nodes.

## Canvas Placement

- Global card: no badge; card goes to the right of the selected node with a 24px gap.
- Local badge: external badge sits at the selected node's top-right corner and is not parented into the selected node or outer frame.
- Local card: card goes to the right of the outermost frame-like ancestor with a 24px gap.
- If the selected content is inside a section, generated badge/card nodes remain inside that section.

## Canvas Styles

- Annotation card width: 395px.
- Card fill: white.
- Card border: `#ededed`, 1px.
- Card radius: 20px.
- Card padding: 20px.
- Card shadow: `0 2 6 rgba(0, 0, 0, 0.04)`.
- Global content width: 355px.
- Local content width: 317px with a 26px badge column and 12px gap.
- Badge fill: `#6B3DF7`.
- Badge radius: 10px.
- Badge padding: 8px horizontal, 2px vertical, min width 26px.
- Badge text: white, 14px, medium weight, 22px line height.
- Badge shadow: `0 2 4 rgba(107, 61, 247, 0.3)`.
- Module divider: 1px, `#EBEBEB`, full content width, with 10px module spacing.
- Use dividers between text, image, and attribute modules, and between different attribute modules.

## Images

- Images can be uploaded from local files or pasted from the clipboard.
- The created Figma image node uses the annotation content width.
- Image height preserves original aspect ratio.
- Image fill uses `scaleMode: "FILL"`.
- Image radius: 14px.

## Attribute Annotation Rules

- Supported options: width/height, min/max width/height, fill, stroke, text style, text fill, radius, box model.
- Width and height include Figma sizing mode: `hug`, `fill`, or `fixed`.
- Radius order is left top, right top, right bottom, left bottom.
- Color rows show variable/style names before raw values.
- Text rows show variable/style names before raw font properties.
- Raw text properties are shown only when no variable and no text style are bound.
- Bound text variables are listed by field, such as font family, font weight, font size, line height, and letter spacing.
- Raw text properties are listed as separate rows: font family/style, font size, line height, and letter spacing.
- Raw colors are shown only when no variable and no paint style are bound.
