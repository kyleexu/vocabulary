import { useRef, useState } from "react";
import type { Word } from "../types";
import {
  downloadVocabularyCsv,
  importVocabularyFromCsv,
  setEasy,
  setFavorite,
  setWrong,
} from "../lib/storage";

type Tab = "wrong" | "favorites" | "easy";

type Props = {
  wrong: Word[];
  favorites: Word[];
  easy: Word[];
  onChange: () => void;
  onBack: () => void;
};

export function WordBooks({
  wrong,
  favorites,
  easy,
  onChange,
  onBack,
}: Props) {
  const [tab, setTab] = useState<Tab>("wrong");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const list =
    tab === "wrong" ? wrong : tab === "favorites" ? favorites : easy;

  const remove = (entry: Word) => {
    if (tab === "wrong") setWrong(entry.english, entry.id, false);
    else if (tab === "favorites") setFavorite(entry.english, entry.id, false);
    else setEasy(entry.english, entry.id, false);
    onChange();
  };

  const onPickCsv = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const text = await file.text();
      const words = await importVocabularyFromCsv(text);
      onChange();
      setMessage(`已导入 ${words.length} 词，已覆盖 vocabulary.json`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>词本管理</h2>
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => void onPickCsv(e.target.files?.[0] ?? null)}
          />
          <button
            className="btn"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? "导入中…" : "导入 CSV"}
          </button>
          <button className="btn" onClick={() => downloadVocabularyCsv()}>
            导出 CSV
          </button>
          <button className="btn ghost" onClick={onBack}>
            返回
          </button>
        </div>
      </div>

      {message && <p className="muted">{message}</p>}

      <div className="tabs">
        {(
          [
            ["wrong", `错词本 (${wrong.length})`],
            ["favorites", `收藏本 (${favorites.length})`],
            ["easy", `简单词 (${easy.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={`chip ${tab === k ? "on" : ""}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="list">
        {list.length === 0 && <p className="muted">暂无内容</p>}
        {list.map((w) => (
          <div className="list-item" key={`${tab}-${w.id}-${w.english}`}>
            <div>
              <strong>{w.english}</strong>
              <div className="muted">{w.chinese}</div>
              <div className="faint">
                #{w.id} · {w.category}
              </div>
            </div>
            <button className="btn danger" onClick={() => remove(w)}>
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
