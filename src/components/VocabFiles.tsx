import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Accent, Word } from "../types";
import {
  categoriesFromWords,
  formatCategoryLabel,
  sortWordsByCsvOrder,
} from "../data/categories";
import {
  addWordOnDisk,
  deleteWordOnDisk,
  editWordOnDisk,
  getDataFile,
  getSettings,
  listVocabularyFiles,
  setEasy,
  setFavorite,
  setWrong,
} from "../lib/storage";
import { speakWord } from "../lib/speech";

type Props = {
  words: Word[];
  currentFile: string;
  wordCount: number;
  switching: boolean;
  onSelectFile: (file: string) => void;
  onWordPatched: (word: Word) => void;
  onWordAdded: (word: Word) => void;
  onWordDeleted: (id: number) => void;
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

function speakAccent(): Accent {
  const mode = getSettings().speakMode;
  return mode === "uk" ? "uk" : "us";
}

export function VocabFiles({
  words,
  currentFile,
  wordCount,
  switching,
  onSelectFile,
  onWordPatched,
  onWordAdded,
  onWordDeleted,
  onBack,
}: Props) {
  const [files, setFiles] = useState<string[]>([currentFile]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [english, setEnglish] = useState("");
  const [chinese, setChinese] = useState("");
  const [pos, setPos] = useState("");
  const [categoryMode, setCategoryMode] = useState<"existing" | "new">(
    "existing",
  );
  const [addCategoryId, setAddCategoryId] = useState<number | "">("");
  const [newCategory, setNewCategory] = useState("");
  const [addToFavorites, setAddToFavorites] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null,
  );

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEnglish, setEditEnglish] = useState("");
  const [editChinese, setEditChinese] = useState("");
  const [editPos, setEditPos] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const categories = useMemo(() => categoriesFromWords(words), [words]);

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return sortWordsByCsvOrder(words.filter((w) => matchesQuery(w, q))).slice(
      0,
      80,
    );
  }, [words, query]);

  const categoryWords = useMemo(() => {
    if (selectedCategoryId == null) return [];
    return sortWordsByCsvOrder(
      words.filter((w) => w.categoryId === selectedCategoryId),
    );
  }, [words, selectedCategoryId]);

  useEffect(() => {
    void (async () => {
      try {
        setFiles(await listVocabularyFiles());
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  useEffect(() => {
    setSelectedCategoryId(null);
    setQuery("");
    setEditingId(null);
  }, [currentFile]);

  const selectCategory = (categoryId: number) => {
    setSelectedCategoryId((prev) =>
      prev === categoryId ? null : categoryId,
    );
    setEditingId(null);
    setQuery("");
  };

  const resetAddForm = () => {
    setEnglish("");
    setChinese("");
    setPos("");
    setNewCategory("");
    setAddToFavorites(false);
  };

  const onAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");

    let category = "";
    let resolvedCategoryId: number | undefined;

    if (categoryMode === "existing") {
      const cat = categories.find((c) => c.categoryId === Number(addCategoryId));
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
      resetAddForm();
      setShowAdd(false);
      setMessage(`已添加 #${created.id} ${created.english}`);
      setQuery(created.english);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const patchFlag = async (
    word: Word,
    kind: "wrong" | "favorites" | "easy",
    on: boolean,
  ) => {
    try {
      const updated =
        kind === "wrong"
          ? await setWrong(word.id, on)
          : kind === "favorites"
            ? await setFavorite(word.id, on)
            : await setEasy(word.id, on);
      onWordPatched(updated);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const openEdit = (word: Word) => {
    setEditingId(word.id);
    setEditEnglish(word.english);
    setEditChinese(word.chinese);
    setEditPos(word.pos ?? "");
  };

  const onEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editingId == null) return;
    setEditSaving(true);
    setMessage("");
    try {
      const updated = await editWordOnDisk({
        id: editingId,
        english: editEnglish,
        chinese: editChinese,
        pos: editPos,
      });
      onWordPatched(updated);
      setEditingId(null);
      setMessage(`已保存 #${updated.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setEditSaving(false);
    }
  };

  const removeWord = async (word: Word) => {
    if (!window.confirm(`确定删除「${word.english}」？`)) return;
    try {
      await deleteWordOnDisk(word.id);
      onWordDeleted(word.id);
      if (editingId === word.id) setEditingId(null);
      setMessage(`已删除 #${word.id} ${word.english}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const speak = (word: Word) => {
    const rate = getSettings().speakRate;
    void speakWord(word.english, speakAccent(), rate);
  };

  const renderWordRow = (w: Word) => {
    if (editingId === w.id) {
      return (
        <div className="list-item vocab-list-item" key={`edit-${w.id}`}>
          <form
            className="stack word-add-form"
            style={{ width: "100%", maxWidth: "100%" }}
            onSubmit={(e) => void onEditSubmit(e)}
          >
            <label className="form-field">
              <span>英文</span>
              <input
                className="field"
                value={editEnglish}
                onChange={(e) => setEditEnglish(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="form-field">
              <span>中文</span>
              <input
                className="field"
                value={editChinese}
                onChange={(e) => setEditChinese(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>词性</span>
              <input
                className="field"
                value={editPos}
                onChange={(e) => setEditPos(e.target.value)}
                placeholder="e.g. n."
              />
            </label>
            <div className="row">
              <button className="btn primary" type="submit" disabled={editSaving}>
                {editSaving ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setEditingId(null)}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div className="list-item vocab-list-item" key={w.id}>
        <div>
          <strong>{w.english}</strong>
          <div className="muted">
            {w.pos ? `${w.pos} · ` : ""}
            {w.chinese}
          </div>
          <div className="faint">
            #{w.id} · {formatCategoryLabel(w.category, w.categoryId)}
            {w.isWrong === 1 ? " · 错词" : ""}
            {w.isFavorites === 1 ? " · 收藏" : ""}
            {w.isEasy === 1 ? " · 简单" : ""}
          </div>
        </div>
        <div className="vocab-list-actions">
          <button type="button" className="btn ghost" onClick={() => speak(w)}>
            发音
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void patchFlag(w, "wrong", w.isWrong !== 1)}
          >
            {w.isWrong === 1 ? "移出错词" : "加入错词"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void patchFlag(w, "favorites", w.isFavorites !== 1)}
          >
            {w.isFavorites === 1 ? "移出收藏" : "加入收藏"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void patchFlag(w, "easy", w.isEasy !== 1)}
          >
            {w.isEasy === 1 ? "移出简单词" : "加入简单词"}
          </button>
          <button type="button" className="btn" onClick={() => openEdit(w)}>
            编辑
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => void removeWord(w)}
          >
            删除
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>词库</h2>
        <button className="btn ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <p className="muted" style={{ margin: 0 }}>
        当前 <strong>{currentFile}</strong> · {wordCount} 词。先查词/加词，再选分类查看列表。
      </p>

      {message && <p className="muted">{message}</p>}
      {switching && <p className="muted">正在切换词库…</p>}

      <div className="tabs" role="tablist" aria-label="词库文件">
        {files.map((file) => (
          <button
            key={file}
            type="button"
            role="tab"
            aria-selected={file === currentFile}
            className={`chip ${file === currentFile ? "on" : ""}`}
            disabled={switching}
            onClick={() => {
              if (file !== currentFile) onSelectFile(file);
            }}
          >
            {file}
          </button>
        ))}
      </div>

      <section className="stack vocab-search-block">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>查词 / 搜词</h3>
          <button
            type="button"
            className="btn"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "收起加词" : "添加单词"}
          </button>
        </div>
        <input
          className="field"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim()) {
              setSelectedCategoryId(null);
              setEditingId(null);
            }
          }}
          placeholder="输入英文 / 中文 / 分类 / id 查询…"
        />
        {query.trim() ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              找到 {searchResults.length}
              {searchResults.length >= 80 ? "+" : ""} 条
            </p>
            <div className="list vocab-word-list">
              {searchResults.length === 0 && (
                <p className="muted">没有匹配结果</p>
              )}
              {searchResults.map((w) => renderWordRow(w))}
            </div>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            在当前文件 {getDataFile()} 中搜索；下方可选分类查看全部单词。
          </p>
        )}

        {showAdd && (
          <form className="stack word-add-form" onSubmit={(e) => void onAddSubmit(e)}>
            <label className="form-field">
              <span>英文</span>
              <input
                className="field"
                value={english}
                onChange={(e) => setEnglish(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>中文</span>
              <input
                className="field"
                value={chinese}
                onChange={(e) => setChinese(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>词性（可选）</span>
              <input
                className="field"
                value={pos}
                onChange={(e) => setPos(e.target.value)}
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
                  value={addCategoryId === "" ? "" : String(addCategoryId)}
                  onChange={(e) =>
                    setAddCategoryId(
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
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "保存中…" : "添加单词"}
            </button>
          </form>
        )}
      </section>

      <section className="stack">
        <h3 style={{ margin: 0 }}>按分类浏览</h3>
        <div className="row">
          {categories.map((cat) => {
            const n = words.filter((w) => w.categoryId === cat.categoryId)
              .length;
            return (
              <button
                key={cat.categoryId}
                type="button"
                className={`chip ${selectedCategoryId === cat.categoryId ? "on" : ""}`}
                onClick={() => selectCategory(cat.categoryId)}
              >
                {formatCategoryLabel(cat.category, cat.categoryId)} ({n})
              </button>
            );
          })}
        </div>

        {selectedCategoryId == null && !query.trim() && (
          <p className="muted">选择一个分类后，按列表查看该分类下全部单词。</p>
        )}

        {selectedCategoryId != null && (
          <>
            <p className="muted" style={{ margin: 0 }}>
              共 {categoryWords.length} 词
            </p>
            <div className="list vocab-word-list">
              {categoryWords.length === 0 && (
                <p className="muted">该分类下暂无单词。</p>
              )}
              {categoryWords.map((w) => renderWordRow(w))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
