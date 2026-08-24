# Vocabulary Trainer

本地运行的背单词前端应用。

## 功能

- **背单词**：展示 / 隐藏悬停；按一个或多个 category 抽词；本地美音/英音发音
- **词本**：错词本、收藏本（生词本）、简单词（写在词库 JSON 的 0/1 标记里）
- **导出**：可将 `vocabulary.json` 导出为 CSV
- **导入**：在「词本」页手动选择 CSV，整库覆盖写入 `vocabulary.json`

## 启动

```bash
npm install
npm run dev
```

## 数据文件

| 文件 | 说明 |
|---|---|
| `data/*.json` | 词库与词本状态（唯一数据源）。应用内「词库」选项卡可切换文件 |

词库字段：`id, categoryId, category, english, chinese, pos, isWrong, isFavorites, isEasy`。`pos` 为词性；后三列为 `0` / `1`。

`npm run dev` 时，练习中改词本标记会写回当前选中的 `data/*.json`。在「词本」页可导入 / 导出 CSV。
