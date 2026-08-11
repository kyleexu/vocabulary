import { useEffect, useMemo, useRef, useState } from "react";
import type { Accent, DisplayMode, Word, WordOrder } from "../types";
import {
  getSettings,
  saveSettings,
  setEasy,
  setFavorite,
  setWrong,
} from "../lib/storage";
import {
  normalizeAnswer,
  shuffle,
  speakWord,
  stopSpeaking,
} from "../lib/speech";
import {
  categoriesFromWords,
  formatCategoryLabel,
  sortWordsByCsvOrder,
} from "../data/categories";

type SourceMode = "categories" | "wrong" | "favorites";

function SpeakerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
      />
    </svg>
  );
}

/** Per-character slots: stable width, no layout jump. */
function WordSlots({
  target,
  value,
  mode,
  hoverReveal,
}: {
  target: string;
  value: string;
  mode: DisplayMode;
  hoverReveal: boolean;
}) {
  const chars = [...target];
  const revealGhost = mode === "full" || hoverReveal;

  return (
    <div className="word-slots" style={{ ["--n" as string]: String(chars.length) }}>
      {chars.map((ch, i) => {
        if (ch === "-") {
          return (
            <span key={i} className="word-slot hyphen">
              -
            </span>
          );
        }
        if (ch === " ") {
          return <span key={i} className="word-slot space" />;
        }

        const typed = value[i];
        if (typed !== undefined) {
          const ok = typed.toLowerCase() === ch.toLowerCase();
          return (
            <span key={i} className={`word-slot typed ${ok ? "ok" : "bad"}`}>
              {typed}
            </span>
          );
        }

        if (revealGhost) {
          return (
            <span key={i} className="word-slot ghost">
              {ch}
            </span>
          );
        }

        return (
          <span key={i} className="word-slot mask">
            _
          </span>
        );
      })}
    </div>
  );
}

export function WordsSetup({
  words,
  wrongWords,
  favoriteWords,
  onStart,
  onBack,
}: {
  words: Word[];
  wrongWords: Word[];
  favoriteWords: Word[];
  onStart: (payload: {
    list: Word[];
    accent: Accent;
    autoSpeak: boolean;
  }) => void;
  onBack: () => void;
}) {
  const categories = useMemo(() => categoriesFromWords(words), [words]);
  const settings = getSettings();
  const [selected, setSelected] = useState<number[]>([]);
  const [source, setSource] = useState<SourceMode>("categories");
  const [accent, setAccent] = useState<Accent>(settings.accent);
  const [autoSpeak, setAutoSpeak] = useState(settings.autoSpeak);
  const [limit, setLimit] = useState<number | "">(50);
  const [order, setOrder] = useState<WordOrder>(settings.order ?? "random");
  const [startIndex, setStartIndex] = useState<number | "">(1);

  const toggleCat = (categoryId: number) => {
    setSelected((prev) =>
      prev.includes(categoryId)
        ? prev.filter((c) => c !== categoryId)
        : [...prev, categoryId],
    );
  };

  const pool = useMemo(() => {
    let list: Word[];
    if (source === "wrong") list = wrongWords;
    else if (source === "favorites") list = favoriteWords;
    else {
      const cats = selected.length
        ? selected
        : categories.map((c) => c.categoryId);
      list = words.filter((w) => cats.includes(w.categoryId));
    }
    return sortWordsByCsvOrder(list);
  }, [source, wrongWords, favoriteWords, selected, categories, words]);

  const start = () => {
    const n = Math.max(1, typeof limit === "number" ? limit : 1);
    const startAt = typeof startIndex === "number" ? startIndex : 1;
    let list: Word[];
    if (order === "random") {
      list = shuffle(pool).slice(0, n);
    } else {
      const from = Math.min(
        Math.max(0, startAt - 1),
        Math.max(0, pool.length - 1),
      );
      list = pool.slice(from, from + n);
    }
    if (!list.length) {
      alert("当前词库为空，请先选择分类或添加单词。");
      return;
    }
    saveSettings({ accent, autoSpeak, order });
    onStart({ list, accent, autoSpeak });
  };

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>背单词</h2>
        <button className="btn ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <div className="tabs">
        {(
          [
            ["categories", "按分类"],
            ["wrong", `错词本 (${wrongWords.length})`],
            ["favorites", `收藏本 (${favoriteWords.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={`chip ${source === k ? "on" : ""}`}
            onClick={() => setSource(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "categories" && (
        <div className="stack">
          <div className="row">
            <button
              className="btn ghost"
              onClick={() => setSelected(categories.map((c) => c.categoryId))}
            >
              全选
            </button>
            <button className="btn ghost" onClick={() => setSelected([])}>
              清空
            </button>
          </div>
          <div className="row">
            {categories.map((cat) => (
              <button
                key={cat.categoryId}
                className={`chip ${selected.includes(cat.categoryId) ? "on" : ""}`}
                onClick={() => toggleCat(cat.categoryId)}
              >
                {formatCategoryLabel(cat.category, cat.categoryId)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="settings-bar">
        <span className="muted">发音</span>
        <button
          className={`chip ${accent === "us" ? "on" : ""}`}
          onClick={() => setAccent("us")}
        >
          美音
        </button>
        <button
          className={`chip ${accent === "uk" ? "on" : ""}`}
          onClick={() => setAccent("uk")}
        >
          英音
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={autoSpeak}
            onChange={(e) => setAutoSpeak(e.target.checked)}
          />
          自动发音
        </label>
        <label className="toggle">
          数量
          <input
            className="field"
            style={{ width: 80, padding: "6px 8px" }}
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setLimit("");
                return;
              }
              const n = Number(raw);
              if (!Number.isNaN(n)) setLimit(n);
            }}
          />
        </label>
      </div>

      <div className="row">
        <span className="muted">顺序</span>
        <button
          className={`chip ${order === "random" ? "on" : ""}`}
          onClick={() => setOrder("random")}
        >
          随机
        </button>
        <button
          className={`chip ${order === "sequential" ? "on" : ""}`}
          onClick={() => setOrder("sequential")}
        >
          顺序
        </button>
        {order === "sequential" && (
          <label className="toggle">
            起始序号
            <input
              className="field"
              style={{ width: 80, padding: "6px 8px" }}
              type="number"
              min={1}
              max={Math.max(1, pool.length)}
              value={startIndex}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setStartIndex("");
                  return;
                }
                const n = Number(raw);
                if (!Number.isNaN(n)) setStartIndex(n);
              }}
            />
          </label>
        )}
      </div>

      <p className="muted">
        {(() => {
          const n = Math.max(1, typeof limit === "number" ? limit : 1);
          const startAt = Math.max(
            1,
            typeof startIndex === "number" ? startIndex : 1,
          );
          if (order === "random") {
            return `候选 ${pool.length} 词 · 将随机抽取 ${Math.min(n, pool.length)} 词`;
          }
          const from = Math.min(startAt, Math.max(1, pool.length));
          const count = Math.min(n, Math.max(0, pool.length - from + 1));
          return `候选 ${pool.length} 词 · 将从第 ${from} 词起按顺序取 ${count} 词`;
        })()}
      </p>

      <button className="btn primary" onClick={start}>
        开始练习
      </button>
    </div>
  );
}

export function WordsPractice({
  list,
  accent,
  autoSpeak,
  onBack,
  onWordPatched,
}: {
  list: Word[];
  accent: Accent;
  autoSpeak: boolean;
  onBack: () => void;
  onWordPatched: (word: Word) => void;
}) {
  const [index, setIndex] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("hidden");
  const [hoverReveal, setHoverReveal] = useState(false);
  const [input, setInput] = useState("");
  const [inputForId, setInputForId] = useState<number | null>(null);
  const [inWrong, setInWrong] = useState(false);
  const [inEasy, setInEasy] = useState(false);
  const [inFav, setInFav] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState("");
  const inputShellRef = useRef<HTMLDivElement>(null);

  const word = list[index];

  // Reset typing state in the same render as word change — avoids one-frame
  // mismatch (old input vs new word) that flashes letters red.
  if (word && inputForId !== word.id) {
    setInputForId(word.id);
    let seed = "";
    while (
      seed.length < word.english.length &&
      word.english[seed.length] === "-"
    ) {
      seed += "-";
    }
    setInput(seed);
    setToast("");
    setHoverReveal(false);
  }

  useEffect(() => {
    if (!word) return;
    setInWrong(word.isWrong === 1);
    setInEasy(word.isEasy === 1);
    setInFav(word.isFavorites === 1);
    const t = window.setTimeout(() => inputShellRef.current?.focus(), 0);

    if (autoSpeak) {
      void speakWord(word.english, accent);
    }

    return () => {
      stopSpeaking();
      window.clearTimeout(t);
    };
  }, [word, autoSpeak, accent]);

  const next = () => {
    if (index >= list.length - 1) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1200);
  };

  const appendInput = (ch: string) => {
    setInput((prev) => {
      if (prev.length >= word.english.length) return prev;
      let nextVal = prev + ch;
      while (
        nextVal.length < word.english.length &&
        word.english[nextVal.length] === "-"
      ) {
        nextVal += "-";
      }
      return nextVal;
    });
  };

  const backspaceInput = () => {
    setInput((prev) => {
      if (!prev) return prev;
      let nextVal = prev.slice(0, -1);
      while (nextVal.endsWith("-") && word.english[nextVal.length] === "-") {
        nextVal = nextVal.slice(0, -1);
      }
      return nextVal;
    });
  };

  const handleTypeKey = (e: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    preventDefault: () => void;
  }) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (normalizeAnswer(input) === normalizeAnswer(word.english)) {
        flash("正确");
        window.setTimeout(next, 280);
      } else {
        flash("再试一次");
      }
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      backspaceInput();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      let seed = "";
      while (
        seed.length < word.english.length &&
        word.english[seed.length] === "-"
      ) {
        seed += "-";
      }
      setInput(seed);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      appendInput(e.key);
    }
  };

  // Capture typing even after clicking action buttons (focus left the shell)
  useEffect(() => {
    if (done || !word) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;

      // ⌘K / Ctrl+K → speak current word
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void speakWord(word.english, accent);
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Let focused buttons keep Enter/Space for accessibility
      if (
        target?.closest("button") &&
        (e.key === "Enter" || e.key === " ")
      ) {
        return;
      }
      handleTypeKey(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest word/input
  }, [done, word, input, index, accent]);

  const toggleWrong = () => {
    const next = !inWrong;
    void (async () => {
      try {
        const updated = await setWrong(word.id, next);
        setInWrong(updated.isWrong === 1);
        onWordPatched(updated);
        flash(updated.isWrong === 1 ? "已加入错词本" : "已移出错词本");
      } catch (err) {
        flash(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const toggleEasy = () => {
    const next = !inEasy;
    void (async () => {
      try {
        const updated = await setEasy(word.id, next);
        setInEasy(updated.isEasy === 1);
        onWordPatched(updated);
        flash(updated.isEasy === 1 ? "已加入简单词本" : "已移出简单词本");
      } catch (err) {
        flash(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const toggleFav = () => {
    const next = !inFav;
    void (async () => {
      try {
        const updated = await setFavorite(word.id, next);
        setInFav(updated.isFavorites === 1);
        onWordPatched(updated);
        flash(updated.isFavorites === 1 ? "已加入收藏本" : "已移出收藏本");
      } catch (err) {
        flash(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  if (done || !word) {
    return (
      <div className="panel stack">
        <h2>本轮结束</h2>
        <p className="muted">共练习 {list.length} 词</p>
        <button className="btn primary" onClick={onBack}>
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="panel practice-panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <button
            className={`chip ${displayMode === "full" ? "on" : ""}`}
            onClick={() => setDisplayMode("full")}
          >
            展示
          </button>
          <button
            className={`chip ${displayMode === "hidden" ? "on" : ""}`}
            onClick={() => {
              setDisplayMode("hidden");
              setHoverReveal(false);
            }}
          >
            隐藏
          </button>
        </div>
        <button className="btn ghost" onClick={onBack}>
          结束
        </button>
      </div>

      <div className="progress">
        <i style={{ width: `${((index + 1) / list.length) * 100}%` }} />
      </div>
      <p className="muted" style={{ marginTop: 0, textAlign: "center" }}>
        {index + 1} / {list.length}
      </p>

      <div className="flash-stage" onClick={() => inputShellRef.current?.focus()}>
        <div className="flash-word-row">
          <div
            ref={inputShellRef}
            className="word-input-shell"
            tabIndex={0}
            onMouseEnter={() => {
              if (displayMode === "hidden") setHoverReveal(true);
            }}
            onMouseLeave={() => {
              if (displayMode === "hidden") setHoverReveal(false);
            }}
          >
            <WordSlots
              target={word.english}
              value={inputForId === word.id ? input : ""}
              mode={displayMode}
              hoverReveal={hoverReveal}
            />
          </div>
          <button
            type="button"
            className="speak-btn"
            title="发音"
            onClick={(e) => {
              e.stopPropagation();
              void speakWord(word.english, accent);
            }}
          >
            <SpeakerIcon />
          </button>
        </div>

        <p className="flash-chinese">{word.chinese}</p>
        <span className="category">
          #{word.id} / {formatCategoryLabel(word.category, word.categoryId)}
        </span>
      </div>

      <p className={`feedback ${toast ? (toast === "正确" || toast.startsWith("已") ? "ok" : toast === "再试一次" ? "bad" : "ok") : ""}`}>
        {toast || " "}
      </p>

      <div className="practice-actions">
        <button className="btn" onClick={toggleWrong}>
          {inWrong ? "移出错词本" : "加入错词本"}
        </button>
        <button className="btn" onClick={toggleEasy}>
          {inEasy ? "移出简单词本" : "加入简单词本"}
        </button>
        <button className="btn" onClick={toggleFav}>
          {inFav ? "移出收藏本" : "加入收藏本"}
        </button>
        <button className="btn primary" onClick={next}>
          下一个
        </button>
      </div>
    </div>
  );
}
