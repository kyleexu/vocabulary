import { useState } from "react";
import type { WordEntry } from "../types";
import {
  removeEasy,
  removeFavorite,
  removeTrash,
  removeWrong,
  syncBooksToDisk,
} from "../lib/storage";

type Tab = "wrong" | "favorites" | "easy" | "trash";

type Props = {
  wrong: WordEntry[];
  favorites: WordEntry[];
  easy: WordEntry[];
  trash: WordEntry[];
  onChange: () => void;
  onBack: () => void;
};

export function WordBooks({
  wrong,
  favorites,
  easy,
  trash,
  onChange,
  onBack,
}: Props) {
  const [tab, setTab] = useState<Tab>("wrong");

  const list =
    tab === "wrong"
      ? wrong
      : tab === "favorites"
        ? favorites
        : tab === "easy"
          ? easy
          : trash;

  const remove = (english: string) => {
    if (tab === "wrong") removeWrong(english);
    else if (tab === "favorites") removeFavorite(english);
    else if (tab === "easy") removeEasy(english);
    else removeTrash(english);
    void syncBooksToDisk();
    onChange();
  };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>词本管理</h2>
        <button className="btn ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <p className="muted">
        数据保存在项目 <code>data/</code> 目录：
        <code> wrong-words.csv </code>、<code> favorites.csv </code>、
        <code> easy-words.json </code>、<code> trash.csv </code>。
      </p>

      <div className="tabs">
        {(
          [
            ["wrong", `错词本 (${wrong.length})`],
            ["favorites", `收藏本/生词本 (${favorites.length})`],
            ["easy", `简单词 (${easy.length})`],
            ["trash", `回收站 (${trash.length})`],
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
          <div className="list-item" key={`${tab}-${w.english}`}>
            <div>
              <strong>{w.english}</strong>
              <div className="muted">{w.chinese}</div>
              <div className="faint">
                {w.category ?? "—"}
                {w.wrongCount ? ` · 错 ${w.wrongCount} 次` : ""}
              </div>
            </div>
            <button className="btn danger" onClick={() => remove(w.english)}>
              {tab === "trash" ? "彻底删除" : "删除"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
