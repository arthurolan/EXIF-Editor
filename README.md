# 影刻·EXIF

隐私优先的本地 JPEG EXIF 编辑器。照片的读取、修改与验证都在浏览器中完成。

## 本地开发

需要 Node.js 22 和 pnpm 10。

```bash
pnpm install
pnpm dev
```

`pnpm build` 会在 `out/` 生成可部署到任意静态托管服务的文件，`pnpm test`
会执行构建并检查 GitHub Pages 所需的主要产物。

## GitHub Pages

推送到 `main` 后，[Deploy GitHub Pages](.github/workflows/deploy-pages.yml)
工作流会：

1. 自动识别用户站点（`<owner>.github.io`）或项目站点的路径；
2. 生成带正确子路径和公开地址的 Next.js 静态导出；
3. 验证 HTML、社交分享图和 WebAssembly 文件；
4. 发布到 `github-pages` 环境。

也可以在 GitHub 的 **Actions** 页面手动运行该工作流。首次发布前，仓库的
**Settings → Pages → Build and deployment → Source** 应设为 **GitHub Actions**。
