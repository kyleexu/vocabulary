# Vocabulary Trainer

本地运行的背单词前端应用。

## 功能

- **背单词**：记忆 / 默写；按一个或多个 category 随机抽词；音标、美音/英音发音；错误统计
- **词本**：错词本、收藏本（生词本）、简单词、回收站
- **本地文件**：词本保存在项目 `data/` 目录

## 启动

```bash
npm install
npm run dev
```

## 数据文件

| 文件 | 说明 |
|---|---|
| `data/vocabulary.csv` | 原始词库 |
| `public/data/vocabulary.json` | 前端加载的词库 |
| `data/wrong-words.csv` | 错词本 |
| `data/favorites.csv` | 收藏本 |
| `data/easy-words.json` | 简单词 |
| `data/trash.csv` | 回收站 |

`npm run dev` 时，练习中的增删会自动写回上述 `data/` 文件。
