# Fairy HDD 电子眼 - 阶段 5（layers_v4）

`build_fairy_layers_v4.py` 是运行时分层资产的唯一导出脚本。用 PIL + 圆环蒙版从无球源图确定性切层；不调用 ComfyUI。

## 分层契约

| 层级 | 内容 | 运行时变换 |
| --- | --- | --- |
| L1 | 最外侧光圈 | 不加载 |
| L2 | 深蓝机械圆环 | 仅顺时针旋转（13 s/圈） |
| L3 | 白色外环 + 外侧蓝光晕 | 眼白组平移；呼吸缩放（2 s） |
| L4 | 浅蓝带 | 眼白组平移 |
| L5 | 内侧青蓝细环 | 眼白组平移 |
| L6 | 中央核心 | 眼白组平移；呼吸缩放 |
| L7 | 右下白色圆点 | 眼白组平移；贴 L6 外缘相切，不缩放 |

L3–L7 同属 `eyeWhiteRoot`。L2 内侧用暗环纹理向内填平，避免眼白位移时露出黑缝或白环叠影。

## 源图

- `无第7层圆环的fiary.png`：无 L7 的完整眼
- `第四层白环.png`：L7 白盘素材
- `底层背景.png`：背景层
- `fairy定位.png`：分层编号参考（不参与导出）

## 重新导出

```powershell
python live2d-fairy\build_fairy_layers_v4.py
```

写出到 `ZeroFairyClient/src/renderer/public/fairy/layers_v4/`；QA 预览在 `live2d-fairy/qa/layers_v4/`。
