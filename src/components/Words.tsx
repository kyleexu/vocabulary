import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import type {
  Accent,
  DisplayMode,
  SpeakMode,
  Word,
  WordOrder,
} from "../types";
import { getSettings, saveSettings, setEasy, setFavorite, setWrong, SPEAK_RATE_CHOICES, AUTO_ADVANCE_DELAY_CHOICES } from "../lib/storage";
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

type SourceMode = "all" | "wrong" | "favorites" | "easy";

/** Prefill leading "-" / " " so caret starts on the first letter. */
function structuralPrefix(english: string): string {
  let seed = "";
  while (
    seed.length < english.length &&
    (english[seed.length] === "-" || english[seed.length] === " ")
  ) {
    seed += english[seed.length];
  }
  return seed;
}

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

  const copyWord = (e: ClipboardEvent) => {
    // Grid slots copy as one char per line in some browsers — force plain word.
    e.preventDefault();
    e.clipboardData.setData("text/plain", target);
  };

  return (
    <div
      className="word-slots"
      style={{ ["--n" as string]: String(chars.length) }}
      onCopy={copyWord}
      onCut={copyWord}
    >
      {chars.map((ch, i) => {
        const typed = value[i];

        // Hyphen / space: never mask a real typed char behind the structural glyph.
        if (ch === "-" || ch === " ") {
          if (typed !== undefined) {
            const ok = typed === ch;
            return (
              <span
                key={i}
                className={`word-slot typed ${ok ? "ok" : "bad"}${ch === " " ? " space" : ""}`}
              >
                {ch === " " && ok ? "" : typed}
              </span>
            );
          }
          if (ch === " ") {
            return <span key={i} className="word-slot space" />;
          }
          if (revealGhost) {
            return (
              <span key={i} className="word-slot hyphen ghost">
                -
              </span>
            );
          }
          return (
            <span key={i} className="word-slot hyphen">
              -
            </span>
          );
        }

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
  easyWords,
  onStart,
  onBack,
}: {
  words: Word[];
  wrongWords: Word[];
  favoriteWords: Word[];
  easyWords: Word[];
  onStart: (payload: { list: Word[] }) => void;
  onBack: () => void;
}) {
  const categories = useMemo(() => categoriesFromWords(words), [words]);
  const settings = getSettings();
  const [selected, setSelected] = useState<number[]>([]);
  const [source, setSource] = useState<SourceMode>("all");
  const [includeEasy, setIncludeEasy] = useState(false);
  const [limit, setLimit] = useState<number | "">(50);
  const [order, setOrder] = useState<WordOrder>(settings.order ?? "random");
  const [startIndex, setStartIndex] = useState<number | "">(1);

  /** Book/source list before category filter; drops easy words unless checked (or viewing 简单词本). */
  const sourceWords = useMemo(() => {
    const raw =
      source === "wrong"
        ? wrongWords
        : source === "favorites"
          ? favoriteWords
          : source === "easy"
            ? easyWords
            : words;
    if (source !== "easy" && !includeEasy) {
      return raw.filter((w) => w.isEasy !== 1);
    }
    return raw;
  }, [
    source,
    includeEasy,
    wrongWords,
    favoriteWords,
    easyWords,
    words,
  ]);

  const countByCategory = useMemo(() => {
    const map = new Map<number, number>();
    for (const w of sourceWords) {
      map.set(w.categoryId, (map.get(w.categoryId) ?? 0) + 1);
    }
    return map;
  }, [sourceWords]);

  const toggleCat = (categoryId: number) => {
    setSelected((prev) =>
      prev.includes(categoryId)
        ? prev.filter((c) => c !== categoryId)
        : [...prev, categoryId],
    );
  };

  const { pool, excludedEasyCount } = useMemo(() => {
    const cats = selected.length
      ? selected
      : categories.map((c) => c.categoryId);
    const raw =
      source === "wrong"
        ? wrongWords
        : source === "favorites"
          ? favoriteWords
          : source === "easy"
            ? easyWords
            : words;
    const afterCats = raw.filter((w) => cats.includes(w.categoryId));
    // Same rule as sourceWords: dual-tagged easy+wrong/fav stay out unless 简单词 is checked.
    const list =
      source !== "easy" && !includeEasy
        ? afterCats.filter((w) => w.isEasy !== 1)
        : afterCats;
    return {
      pool: sortWordsByCsvOrder(list),
      excludedEasyCount: afterCats.length - list.length,
    };
  }, [
    source,
    includeEasy,
    wrongWords,
    favoriteWords,
    easyWords,
    selected,
    categories,
    words,
  ]);

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
    saveSettings({ ...getSettings(), order });
    onStart({ list });
  };

  const tabCounts = useMemo(() => {
    const withoutEasy = (list: Word[]) =>
      includeEasy ? list : list.filter((w) => w.isEasy !== 1);
    return {
      all: withoutEasy(words).length,
      wrong: withoutEasy(wrongWords).length,
      favorites: withoutEasy(favoriteWords).length,
      easy: easyWords.length,
    };
  }, [includeEasy, words, wrongWords, favoriteWords, easyWords]);

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>背单词</h2>
        <div className="row">
          {source !== "easy" && (
            <label
              className="choice"
              title="未勾选时：简单词不进练习；同时标了错词/收藏的也会排除"
            >
              简单词：
              <input
                type="checkbox"
                checked={includeEasy}
                onChange={(e) => setIncludeEasy(e.target.checked)}
              />
            </label>
          )}
          <button className="btn ghost" onClick={onBack}>
            返回
          </button>
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ["all", `全部 (${tabCounts.all})`],
            ["wrong", `错词本 (${tabCounts.wrong})`],
            ["favorites", `收藏本 (${tabCounts.favorites})`],
            ["easy", `简单词本 (${tabCounts.easy})`],
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
          <span className="muted">
            {selected.length ? "按所选分类筛选" : "未选分类 · 当前来源全部章节"}
          </span>
        </div>
        <div className="row">
          {categories.map((cat) => (
            <button
              key={cat.categoryId}
              className={`chip ${selected.includes(cat.categoryId) ? "on" : ""}`}
              onClick={() => toggleCat(cat.categoryId)}
            >
              {formatCategoryLabel(cat.category, cat.categoryId)} (
              {countByCategory.get(cat.categoryId) ?? 0})
            </button>
          ))}
        </div>
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

      <p className="muted">
        {(() => {
          const n = Math.max(1, typeof limit === "number" ? limit : 1);
          const startAt = Math.max(
            1,
            typeof startIndex === "number" ? startIndex : 1,
          );
          const easyNote =
            excludedEasyCount > 0
              ? ` · 已排除 ${excludedEasyCount} 个简单词`
              : "";
          if (order === "random") {
            return `候选 ${pool.length} 词${easyNote} · 将随机抽取 ${Math.min(n, pool.length)} 词`;
          }
          const from = Math.min(startAt, Math.max(1, pool.length));
          const count = Math.min(n, Math.max(0, pool.length - from + 1));
          return `候选 ${pool.length} 词${easyNote} · 将从第 ${from} 词起按顺序取 ${count} 词`;
        })()}
      </p>

      <button className="btn primary" onClick={start}>
        开始练习
      </button>
    </div>
  );
}

function speakAccent(mode: SpeakMode): Accent {
  return mode === "uk" ? "uk" : "us";
}

export function WordsPractice({
  list,
  onBack,
  onWordPatched,
}: {
  list: Word[];
  onBack: () => void;
  onWordPatched: (word: Word) => void;
}) {
  const settings = getSettings();
  const [index, setIndex] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("hidden");
  const [chineseDisplayMode, setChineseDisplayMode] =
    useState<DisplayMode>("hidden");
  const [hoverReveal, setHoverReveal] = useState(false);
  const [keyReveal, setKeyReveal] = useState(false);
  const [chineseKeyReveal, setChineseKeyReveal] = useState(false);
  const [chineseHoverReveal, setChineseHoverReveal] = useState(false);
  const [input, setInput] = useState("");
  const [inputForId, setInputForId] = useState<number | null>(null);
  const [speakMode, setSpeakMode] = useState<SpeakMode>(settings.speakMode);
  const [speakRate, setSpeakRate] = useState(settings.speakRate);
  const [autoAdvance, setAutoAdvance] = useState(settings.autoAdvance);
  const [autoAdvanceDelayMs, setAutoAdvanceDelayMs] = useState(
    settings.autoAdvanceDelayMs,
  );
  const [inWrong, setInWrong] = useState(false);
  const [inEasy, setInEasy] = useState(false);
  const [inFav, setInFav] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState("");
  const inputShellRef = useRef<HTMLDivElement>(null);
  const advanceTimerRef = useRef(0);
  const correctHandledIdRef = useRef<number | null>(null);

  const word = list[index];
  const accent = speakAccent(speakMode);
  const autoSpeak = speakMode !== "off";

  const changeSpeakMode = (mode: SpeakMode) => {
    setSpeakMode(mode);
    saveSettings({ ...getSettings(), speakMode: mode });
  };

  const changeSpeakRate = (rate: number) => {
    setSpeakRate(rate);
    saveSettings({ ...getSettings(), speakRate: rate });
  };

  const changeAutoAdvance = (on: boolean) => {
    setAutoAdvance(on);
    saveSettings({ ...getSettings(), autoAdvance: on });
  };

  const changeAutoAdvanceDelayMs = (ms: number) => {
    setAutoAdvanceDelayMs(ms);
    saveSettings({ ...getSettings(), autoAdvanceDelayMs: ms });
  };

  const clearAdvanceTimer = () => {
    window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = 0;
  };

  // Reset typing state in the same render as word change — avoids one-frame
  // mismatch (old input vs new word) that flashes letters red.
  if (word && inputForId !== word.id) {
    setInputForId(word.id);
    setInput(structuralPrefix(word.english));
    setToast("");
    setHoverReveal(false);
    setKeyReveal(false);
    setChineseKeyReveal(false);
    setChineseHoverReveal(false);
    correctHandledIdRef.current = null;
    clearAdvanceTimer();
  }

  useEffect(() => {
    if (!word) return;
    setInWrong(word.isWrong === 1);
    setInEasy(word.isEasy === 1);
    setInFav(word.isFavorites === 1);
  }, [word?.id, word?.isWrong, word?.isEasy, word?.isFavorites]);

  // Speak / focus only when the practice word changes — not when book flags update.
  useEffect(() => {
    if (!word) return;
    const english = word.english;
    const focusT = window.setTimeout(() => inputShellRef.current?.focus(), 0);
    // Delay speak so React Strict Mode cleanup / cancel() doesn't swallow it.
    const speakT = autoSpeak
      ? window.setTimeout(() => {
          void speakWord(english, accent, speakRate);
        }, 80)
      : 0;
    return () => {
      window.clearTimeout(focusT);
      window.clearTimeout(speakT);
      stopSpeaking();
    };
  }, [word?.id, word?.english, autoSpeak, accent, speakRate]);

  const next = () => {
    clearAdvanceTimer();
    if (index >= list.length - 1) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
  };

  const prev = () => {
    clearAdvanceTimer();
    if (index <= 0) return;
    setIndex((i) => i - 1);
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1200);
  };

  const onCorrect = () => {
    if (!word || correctHandledIdRef.current === word.id) return;
    correctHandledIdRef.current = word.id;
    flash("正确");
    if (!autoAdvance) return;
    clearAdvanceTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = 0;
      next();
    }, autoAdvanceDelayMs);
  };

  // If the answer is edited after being correct, cancel pending advance.
  useEffect(() => {
    if (!word) return;
    if (normalizeAnswer(input) === normalizeAnswer(word.english)) return;
    if (correctHandledIdRef.current === word.id) {
      correctHandledIdRef.current = null;
      clearAdvanceTimer();
    }
  }, [input, word?.id, word?.english]);

  // Auto-advance when the typed answer becomes fully correct (no Enter needed).
  useEffect(() => {
    if (done || !word || !autoAdvance) return;
    if (normalizeAnswer(input) !== normalizeAnswer(word.english)) return;
    onCorrect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- latch per word via onCorrect
  }, [input, word?.id, word?.english, autoAdvance, autoAdvanceDelayMs, done]);

  useEffect(() => {
    return () => clearAdvanceTimer();
  }, []);

  // While waiting to auto-advance, any mouse move cancels for this word.
  useEffect(() => {
    const onMouseMove = () => {
      if (!advanceTimerRef.current) return;
      clearAdvanceTimer();
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  const fillStructural = (value: string) => {
    let nextVal = value;
    while (
      nextVal.length < word.english.length &&
      (word.english[nextVal.length] === "-" ||
        word.english[nextVal.length] === " ")
    ) {
      nextVal += word.english[nextVal.length];
    }
    return nextVal;
  };

  const appendInput = (ch: string) => {
    setInput((prev) => {
      const before = prev.length;
      let nextVal = fillStructural(prev);
      // "-" / " " already auto-filled at this caret — don't insert a second hidden char
      if (
        nextVal.length > before &&
        (ch === "-" || ch === " ") &&
        nextVal.endsWith(ch)
      ) {
        return nextVal;
      }
      if (nextVal.length >= word.english.length) return nextVal;
      nextVal += ch;
      return fillStructural(nextVal);
    });
  };

  const backspaceInput = () => {
    setInput((prev) => {
      if (!prev) return prev;
      let nextVal = prev.slice(0, -1);
      // Also clear auto-filled trailing "-" / " " so delete doesn't leave a hidden structural char
      while (
        nextVal.length > 0 &&
        (nextVal.endsWith("-") || nextVal.endsWith(" ")) &&
        nextVal[nextVal.length - 1] === word.english[nextVal.length - 1]
      ) {
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
        // Fully correct → Enter always advances (even if auto-advance was cancelled).
        clearAdvanceTimer();
        if (correctHandledIdRef.current !== word.id) {
          correctHandledIdRef.current = word.id;
          flash("正确");
        }
        next();
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
      setInput(structuralPrefix(word.english));
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

    // macOS often suppresses keyup for the non-meta key while ⌘ is held.
    // Keep peek alive via key-repeat heartbeats; hide shortly after repeats stop.
    let peekHoldTimer = 0;
    let chinesePeekHoldTimer = 0;
    const hidePeek = () => {
      window.clearTimeout(peekHoldTimer);
      peekHoldTimer = 0;
      setKeyReveal(false);
    };
    const keepPeek = (fromRepeat: boolean) => {
      setKeyReveal(true);
      window.clearTimeout(peekHoldTimer);
      // First keydown: cover OS delay-until-repeat (~500ms+). Repeats: hide soon after release.
      peekHoldTimer = window.setTimeout(hidePeek, fromRepeat ? 140 : 700);
    };
    const hideChinesePeek = () => {
      window.clearTimeout(chinesePeekHoldTimer);
      chinesePeekHoldTimer = 0;
      setChineseKeyReveal(false);
    };
    const keepChinesePeek = (fromRepeat: boolean) => {
      setChineseKeyReveal(true);
      window.clearTimeout(chinesePeekHoldTimer);
      chinesePeekHoldTimer = window.setTimeout(
        hideChinesePeek,
        fromRepeat ? 140 : 700,
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;

      // ⌘J / Ctrl+J hold → peek word (only when 单词展示 is off)
      if (
        displayMode === "hidden" &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "j"
      ) {
        e.preventDefault();
        keepPeek(e.repeat);
        return;
      }

      // ⌘U / Ctrl+U hold → peek Chinese (only when 中文展示 is off)
      if (
        chineseDisplayMode === "hidden" &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "u"
      ) {
        e.preventDefault();
        keepChinesePeek(e.repeat);
        return;
      }

      // ⌘K / Ctrl+K → speak current word
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void speakWord(word.english, accent, speakRate);
        return;
      }

      // ⌘↑ / Ctrl+↑ → previous word
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        if (index > 0) setIndex((i) => i - 1);
        return;
      }

      // ⌘↓ / Ctrl+↓ → next word
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        if (index >= list.length - 1) {
          setDone(true);
        } else {
          setIndex((i) => i + 1);
        }
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
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "j" || key === "meta" || key === "control") {
        hidePeek();
      }
      if (key === "u" || key === "meta" || key === "control") {
        hideChinesePeek();
      }
    };
    const hideAllPeeks = () => {
      hidePeek();
      hideChinesePeek();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", hideAllPeeks);
    return () => {
      window.clearTimeout(peekHoldTimer);
      window.clearTimeout(chinesePeekHoldTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", hideAllPeeks);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest word/input
  }, [
    done,
    word,
    input,
    index,
    list.length,
    accent,
    speakRate,
    displayMode,
    chineseDisplayMode,
    autoAdvance,
    autoAdvanceDelayMs,
  ]);

  const toggleWrong = () => {
    const nextOn = !inWrong;
    void (async () => {
      try {
        const updated = await setWrong(word.id, nextOn);
        setInWrong(updated.isWrong === 1);
        onWordPatched(updated);
        flash(updated.isWrong === 1 ? "已加入错词本" : "已移出错词本");
      } catch (err) {
        flash(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const toggleEasy = () => {
    const nextOn = !inEasy;
    void (async () => {
      try {
        const updated = await setEasy(word.id, nextOn);
        setInEasy(updated.isEasy === 1);
        onWordPatched(updated);
        flash(updated.isEasy === 1 ? "已加入简单词本" : "已移出简单词本");
      } catch (err) {
        flash(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const toggleFav = () => {
    const nextOn = !inFav;
    void (async () => {
      try {
        const updated = await setFavorite(word.id, nextOn);
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
        <div className="practice-controls">
          <div className="control-group">
            <label className="choice">
              中文展示
              <input
                type="checkbox"
                checked={chineseDisplayMode === "full"}
                onChange={(e) => {
                  if (e.target.checked) {
                    setChineseDisplayMode("full");
                  } else {
                    setChineseDisplayMode("hidden");
                    setChineseKeyReveal(false);
                    setChineseHoverReveal(false);
                  }
                }}
              />
            </label>
            <label className="choice">
              单词展示
              <input
                type="checkbox"
                checked={displayMode === "full"}
                onChange={(e) => {
                  if (e.target.checked) {
                    setDisplayMode("full");
                  } else {
                    setDisplayMode("hidden");
                    setHoverReveal(false);
                  }
                }}
              />
            </label>
          </div>
          <div className="control-group">
            <span className="control-label">发音配置</span>
            {(
              [
                ["off", "不发音"],
                ["us", "美音"],
                ["uk", "英音"],
              ] as const
            ).map(([mode, label]) => (
              <label key={mode} className="choice">
                <input
                  type="radio"
                  name="speakMode"
                  checked={speakMode === mode}
                  onChange={() => changeSpeakMode(mode)}
                />
                {label}
              </label>
            ))}
            <span className="control-sep" aria-hidden="true" />
            <label className="speak-rate">
              <span className="control-label">速度</span>
              <select
                className="rate-select"
                value={speakRate}
                disabled={speakMode === "off"}
                onChange={(e) => changeSpeakRate(Number(e.target.value))}
                aria-label="发音速度"
              >
                {SPEAK_RATE_CHOICES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="control-group">
            <label className="choice">
              自动翻页
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => changeAutoAdvance(e.target.checked)}
              />
            </label>
            <label className="speak-rate">
              <select
                className="rate-select"
                value={autoAdvanceDelayMs}
                disabled={!autoAdvance}
                onChange={(e) =>
                  changeAutoAdvanceDelayMs(Number(e.target.value))
                }
                aria-label="自动翻页间隔"
              >
                {AUTO_ADVANCE_DELAY_CHOICES.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms === 500 ? "0.5s" : `${ms / 1000}s`}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
              hoverReveal={hoverReveal || keyReveal}
            />
          </div>
          <button
            type="button"
            className="speak-btn"
            title="发音"
            onClick={(e) => {
              e.stopPropagation();
              void speakWord(word.english, accent, speakRate);
            }}
          >
            <SpeakerIcon />
          </button>
        </div>

        <p className="flash-pos">词性 · {word.pos || "—"}</p>
        <p
          className="flash-chinese"
          onMouseEnter={() => {
            if (chineseDisplayMode === "hidden") setChineseHoverReveal(true);
          }}
          onMouseLeave={() => {
            if (chineseDisplayMode === "hidden") setChineseHoverReveal(false);
          }}
        >
          {[...word.chinese].map((ch, i) => {
            const revealed =
              chineseDisplayMode === "full" ||
              chineseKeyReveal ||
              chineseHoverReveal;
            return (
              <span key={i} className="chinese-slot">
                <span className="chinese-slot-ghost" aria-hidden="true">
                  {ch === " " ? "\u00a0" : ch}
                </span>
                <span className="chinese-slot-face">
                  {revealed ? (ch === " " ? "\u00a0" : ch) : "＊"}
                </span>
              </span>
            );
          })}
        </p>
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
        <button className="btn" onClick={prev} disabled={index <= 0}>
          上一个
        </button>
        <button className="btn primary" onClick={next}>
          下一个
        </button>
      </div>
    </div>
  );
}
