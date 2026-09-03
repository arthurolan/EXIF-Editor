# 影刻·EXIF

隐私优先的本地照片元数据编辑器。照片的读取、修改、隐私清理与验证都在浏览器中完成；原片不会上传或被原地覆盖。

## V2.0 格式支持

| 格式 | 状态 | 说明 |
| --- | --- | --- |
| JPEG | 稳定支持 | 读取、语义同步写入、冲突检查、隐私清理和 JPEG 扫描数据校验。 |
| PNG | 实测通过 | 支持读取、写入、删除 GPS、隐私清理、保留视觉外观与彻底清空；导出后校验 `IDAT` 图像数据。不同应用对 PNG 元数据的兼容性可能不同。 |
| WebP | 实测通过 | 支持读取、写入、删除 GPS、隐私清理、保留视觉外观与彻底清空；导出后校验 `VP8` / `VP8L` 图像数据并忽略 `VP8X` 容器标志变化。 |
| TIFF、HEIC / HEIF | 未开放 | 仍需真实文件回归测试后再启用。 |
| RAW | 不支持 | V2.0 非目标，避免高风险的厂商私有元数据修改。 |

V2.0 会同步常用 EXIF、XMP 和 IPTC 字段，并提供冲突检查、按组删除、隐私清理预设及导出后复核。MakerNotes、ICC 色彩配置和 Content Credentials 属于高风险数据：默认只读或需要明确选择删除。

## V2.0 实测状态

2026-09-03，使用 WebP、相机 PNG 和 Midjourney PNG 样本完成回归：

- 有 GPS 的 WebP / PNG：`位置 → 删除位置` 与 `按组删除 → 删除 GPS` 均可导出；导出文件重新导入后无经纬度。
- 无 GPS 的 WebP / Midjourney PNG：可添加 GPS。
- PNG / WebP 清理预设：隐私清理、保留视觉外观、彻底清空均可导出，未发现回退。

## 本地开发

需要 Node.js 22 和 pnpm 10。

```bash
pnpm install
pnpm dev
```

`pnpm build` 会在 `out/` 生成可部署到任意静态托管服务的文件，`pnpm test`
会执行构建，并运行格式识别、语义映射、冲突检测、隐私清理和静态产物回归测试。

## GitHub Pages

推送到 `main` 后，[Deploy GitHub Pages](.github/workflows/deploy-pages.yml)
工作流会：

1. 自动识别用户站点（`<owner>.github.io`）或项目站点的路径；
2. 生成带正确子路径和公开地址的 Next.js 静态导出；
3. 验证 HTML、社交分享图和 WebAssembly 文件；
4. 发布到 `github-pages` 环境。

也可以在 GitHub 的 **Actions** 页面手动运行该工作流。首次发布前，仓库的
**Settings → Pages → Build and deployment → Source** 应设为 **GitHub Actions**。
