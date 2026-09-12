import { useMemo, useState, type FormEvent } from "react";
import type { Word } from "../types";
import {
  categoriesFromWords,
  formatCategoryLabel,
  sortWordsByCsvOrder,
} from "../data/categories";
import { addWordOnDisk, getDataFile } from "../lib/storage";

type Tab = "search" | "add";

type Props = {
  words: Word[];
  onWordAdded: (word: Word) => void;
  onBack: () => void;
};

function matchesQuery(word: Word, q: string): boolean {
  if (!q) return false;
  const hay = [
    word.english,
    word.chinese,
    word.pos,
    word.category,
    String(word.id),
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

export function WordLookup({ words, onWordAdded, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [english, setEnglish] = useState("");
  const [chinese, setChinese] = useState("");
  const [pos, setPos] = useState("");
  const [categoryMode, setCategoryMode] = useState<"existing" | "new">(
    "existing",
  );
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [newCategory, setNewCategory] = useState("");
  const [addToFavorites, setAddToFavorites] = useState(false);

  const categories = useMemo(() => categoriesFromWords(words), [words]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return sortWordsByCsvOrder(words.filter((w) => matchesQuery(w, q))).slice(
      0,
      100,
    );
  }, [words, query]);

  const resetForm = () => {
    setEnglish("");
    setChinese("");
    setPos("");
    setNewCategory("");
    setAddToFavorites(false);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");

    let category = "";
    let resolvedCategoryId: number | undefined;

    if (categoryMode === "existing") {
      const cat = categories.find((c) => c.categoryId === Number(categoryId));
      if (!cat) {
        setMessage("请选择已有分类");
        return;
      }
      category = cat.category;
      resolvedCategoryId = cat.categoryId;
    } else {
      category = newCategory.trim();
      if (!category) {
        setMessage("请填写新分类名称");
        return;
      }
    }

    setSaving(true);
    try {
      const created = await addWordOnDisk({
        english,
        chinese,
        pos,
        category,
        categoryId: resolvedCategoryId,
        isFavorites: addToFavorites ? 1 : 0,
      });
      onWordAdded(created);
      resetForm();
      setMessage(
        `已添加 #${created.id} ${created.english} → ${getDataFile()}`,
      );
      setTab("search");
      setQuery(created.english);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>查词 / 加词</h2>
        <button className="btn ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <div className="tabs">
        <button
          className={`chip ${tab === "search" ? "on" : ""}`}
          onClick={() => setTab("search")}
        >
          查询单词
        </button>
        <button
          className={`chip ${tab === "add" ? "on" : ""}`}
          onClick={() => setTab("add")}
        >
          添加单词
        </button>
      </div>

      {message && <p className="muted">{message}</p>}

      {tab === "search" && (
        <div className="stack">
          <input
            className="field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入英文 / 中文 / 分类 / id 查询…"
            autoFocus
          />
          <p className="muted">
            {query.trim()
              ? `找到 ${results.length}${results.length >= 100 ? "+" : ""} 条（当前词库 ${words.length} 词）`
              : `在当前词库 ${getDataFile()}（${words.length} 词）中搜索`}
          </p>
          <div className="list">
            {query.trim() && results.length === 0 && (
              <p className="muted">没有匹配结果</p>
            )}
            {results.map((w) => (
              <div className="list-item" key={`lookup-${w.id}-${w.english}`}>
                <div>
                  <strong>{w.english}</strong>
                  <div className="muted">
                    {w.pos ? `${w.pos} · ` : ""}
                    {w.chinese}
                  </div>
                  <div className="faint">
                    #{w.id} · {formatCategoryLabel(w.category, w.categoryId)}
                    {w.isFavorites === 1 ? " · 收藏" : ""}
                    {w.isWrong === 1 ? " · 错词" : ""}
                    {w.isEasy === 1 ? " · 简单" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "add" && (
        <form className="stack word-add-form" onSubmit={(e) => void onSubmit(e)}>
          <label className="form-field">
            <span>英文</span>
            <input
              className="field"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              placeholder="e.g. Redis"
              required
              autoFocus
            />
          </label>
          <label className="form-field">
            <span>中文</span>
            <input
              className="field"
              value={chinese}
              onChange={(e) => setChinese(e.target.value)}
              placeholder="e.g. 内存键值数据库"
              required
            />
          </label>
          <label className="form-field">
            <span>词性（可选）</span>
            <input
              className="field"
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              placeholder="e.g. n."
            />
          </label>

          <div className="row">
            <button
              type="button"
              className={`chip ${categoryMode === "existing" ? "on" : ""}`}
              onClick={() => setCategoryMode("existing")}
            >
              已有分类
            </button>
            <button
              type="button"
              className={`chip ${categoryMode === "new" ? "on" : ""}`}
              onClick={() => setCategoryMode("new")}
            >
              新分类
            </button>
          </div>

          {categoryMode === "existing" ? (
            <label className="form-field">
              <span>分类</span>
              <select
                className="field rate-select category-select"
                value={categoryId === "" ? "" : String(categoryId)}
                onChange={(e) =>
                  setCategoryId(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                required
              >
                <option value="">选择分类…</option>
                {categories.map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    {formatCategoryLabel(c.category, c.categoryId)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="form-field">
              <span>新分类名称</span>
              <input
                className="field"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. 数据库"
                required
              />
            </label>
          )}

          <label className="choice">
            <input
              type="checkbox"
              checked={addToFavorites}
              onChange={(e) => setAddToFavorites(e.target.checked)}
            />
            同时加入收藏本
          </label>

          <div className="row">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "保存中…" : "添加单词"}
            </button>
            <span className="muted">写入 {getDataFile()}</span>
          </div>
        </form>
      )}
    </div>
  );
}
