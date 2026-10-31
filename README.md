<p align="center">
  <img src="https://img.shields.io/badge/Hugo-FF4088?style=flat-square&logo=hugo&logoColor=white" alt="Hugo">
  <img src="https://img.shields.io/badge/theme-PaperMod-2ea043?style=flat-square" alt="PaperMod">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT">
</p>

<h1 align="center">🌍 zlab · 我的小世界</h1>

<p align="center">
  <em>生活 · 学习 · 日常 · 感悟</em>
</p>

---

## 关于这里

**zlab** 是我的个人小世界，也是我在互联网上的一个小角落。

这里没有特定的主题限制，也没有刻意的内容规划。我会在这里记录：

- 📖 **学习笔记** —— 技术探索、读书摘录、新技能的习得过程
- 💭 **日常随想** —— 生活中的碎片思考与感悟
- 🛠 **踩坑记录** —— 解决过的技术问题和经验沉淀
- 📝 **阶段性总结** —— 对一段时间的回顾与反思

取名 **zlab**，是因为我希望这里像一个实验室 —— 可以自由地尝试、记录、迭代，不必追求完美，只需保持真实。

> 不为取悦他人而写，不为流量而写，只为记录。

## 技术栈

站点基于 [Hugo](https://gohugo.io/) 静态站点生成器构建，使用 [PaperMod](https://github.com/adityatelange/hugo-PaperMod) 主题。

```
Hugo          →  静态站点生成
PaperMod      →  极简主题，专注内容
GitHub Pages  →  托管与部署
```

## 本地运行

```bash
# 克隆仓库（含子模块）
git clone --recursive git@github.com:zhleeo/zlab.git

# 进入目录
cd zlab

# 启动开发服务器
hugo server -D

# 浏览器访问 http://localhost:1313
```

## 目录结构

```
zlab/
├── archetypes/     # 文章模板
├── content/        # 文章内容（Markdown）
├── public/         # 构建输出（自动生成）
├── themes/
│   └── PaperMod/   # 主题（Git 子模块）
├── hugo.toml       # Hugo 配置文件
└── .github/
    └── workflows/  # CI/CD 部署配置
```

## 许可

内容（文章、图片等）采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可。代码部分采用 MIT 许可。

---

<p align="center">
  <sub>🧪 持续实验中 · 保持好奇，保持记录</sub>
</p>