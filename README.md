# Vocabulary Trainer

本地运行的背单词前端应用。

## 功能

- **背单词**：展示 / 隐藏悬停；按一个或多个 category 抽词；音标、美音/英音发音
- **词本**：错词本、收藏本（生词本）、简单词
- **本地文件**：词本保存在项目 `data/` 目录

## 启动

```bash
npm install
npm run dev
```

## 数据文件

| 文件 | 说明 |
|---|---|
| `data/vocabulary.csv` | 词库源文件（含 `id` / `categoryId`，顺序以本文件为准） |
| `public/data/vocabulary.json` | 前端加载的词库（由 CSV 生成） |
| `data/abbreviations.csv` | 缩写词库（同样含 id / categoryId） |
| `data/wrong-words.csv` | 错词本 |
| `data/favorites.csv` | 收藏本 |
| `data/easy-words.json` | 简单词 |

修改 `data/vocabulary.csv` 后执行：

```bash
npm run data:json
```

`npm run build` 会自动先跑 `data:json`。`npm run dev` 时，练习中的词本增删会自动写回上述 `data/` 文件。

词库 CSV 列：`id,categoryId,category,english,chinese`。分类学习顺序由 `categoryId` 决定，不要在代码里硬编码。
