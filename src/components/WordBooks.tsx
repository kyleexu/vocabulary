import { useState } from "react";
import type { WordEntry } from "../types";
import {
  removeEasy,
  removeFavorite,
  removeWrong,
  syncBooksToDisk,
} from "../lib/storage";

type Tab = "wrong" | "favorites" | "easy";

type Props = {
  wrong: WordEntry[];
  favorites: WordEntry[];
  easy: WordEntry[];
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

  const list =
    tab === "wrong" ? wrong : tab === "favorites" ? favorites : easy;

  const remove = (entry: WordEntry) => {
    if (tab === "wrong") removeWrong(entry.english, entry.id);
    else if (tab === "favorites") removeFavorite(entry.english, entry.id);
    else removeEasy(entry.english, entry.id);
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
        <code> easy-words.json </code>。
      </p>

      <div className="tabs">
        {(
          [
            ["wrong", `错词本 (${wrong.length})`],
            ["favorites", `收藏本/生词本 (${favorites.length})`],
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
          <div className="list-item" key={`${tab}-${w.id ?? w.english}`}>
            <div>
              <strong>{w.english}</strong>
              <div className="muted">{w.chinese}</div>
              <div className="faint">
                {w.id != null ? `#${w.id} · ` : ""}
                {w.category ?? "—"}
                {w.wrongCount ? ` · 错 ${w.wrongCount} 次` : ""}
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
