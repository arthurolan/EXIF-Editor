# 影刻·EXIF

隐私优先的本地照片元数据编辑器。照片的读取、修改、隐私清理与验证都在浏览器中完成；原片不会上传或被原地覆盖。

## V2.0 格式支持

| 格式 | 状态 | 说明 |
| --- | --- | --- |
| JPEG | 稳定支持 | 读取、语义同步写入、冲突检查、隐私清理和 JPEG 扫描数据校验。 |
| PNG | 初始支持 | 支持读取、写入与清理；导出后校验 `IDAT` 图像数据。不同应用对 PNG 元数据的兼容性可能不同。 |
| WebP | 初始支持 | 支持读取、写入与清理；导出后校验 `VP8`、`VP8L` 或 `VP8X` 图像数据。 |
| TIFF、HEIC / HEIF | 未开放 | 仍需真实文件回归测试后再启用。 |
| RAW | 不支持 | V2.0 非目标，避免高风险的厂商私有元数据修改。 |

V2.0 会同步常用 EXIF、XMP 和 IPTC 字段，并提供冲突检查、按组删除、隐私清理预设及导出后复核。MakerNotes、ICC 色彩配置和 Content Credentials 属于高风险数据：默认只读或需要明确选择删除。

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

## E.O图文正式镜像与维护规则

本项目是影刻·元数据的功能源码和开发维护地点。工具的正式访问入口现在由 E.O图文统一发布在：

`https://eomoment.com/tools/yingke-metadata/`

以后如果要修改元数据写入、隐私清理、地图选点、导出验证、界面交互、依赖或测试，应先在本项目中修改、测试、提交和推送。不要直接修改 E.O图文项目中的 `.cloudflare-static/tools/yingke-metadata/`，那里只是 Cloudflare 发布前自动生成的临时镜像目录，会被下一次生成覆盖。

E.O图文项目中的 `scripts/prepare-cloudflare-tools.sh` 会把本项目复制到临时构建目录，以 `PAGES_BASE_PATH=/tools/yingke-metadata` 和 `NEXT_PUBLIC_SITE_URL=https://eomoment.com/tools/yingke-metadata` 构建静态导出，然后生成正式镜像，并自动加入 E.O 返回链接、`eo@eomoment.com`、正式域名 canonical/OG 等站点级包装。

GitHub Pages 可继续保留为备用入口和本项目的独立发布结果；正式公开入口以 `eomoment.com/tools/yingke-metadata/` 为准。
