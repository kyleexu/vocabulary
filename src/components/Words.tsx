import { useEffect, useMemo, useState } from "react";
import type { Accent, PhoneticInfo, PracticeMode, SessionStats, Word, WordOrder } from "../types";
import {
  addEasy,
  addFavorite,
  addToTrash,
  getSettings,
  isEasy,
  isFavorite,
  isTrashed,
  removeFavorite,
  saveSettings,
  syncBooksToDisk,
  upsertWrongWord,
} from "../lib/storage";
import { fetchPhonetics, normalizeAnswer, shuffle, speakWord, stopSpeaking } from "../lib/speech";
import {
  formatCategoryLabel,
  sortCategories,
  sortWordsByCategoryOrder,
} from "../data/categories";

type SourceMode = "categories" | "wrong" | "favorites";

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
    mode: PracticeMode;
    accent: Accent;
    showPhonetic: boolean;
    autoSpeak: boolean;
  }) => void;
  onBack: () => void;
}) {
  const categories = useMemo(
    () => sortCategories([...new Set(words.map((w) => w.category))]),
    [words],
  );
  const settings = getSettings();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<PracticeMode>("memory");
  const [source, setSource] = useState<SourceMode>("categories");
  const [accent, setAccent] = useState<Accent>(settings.accent);
  const [showPhonetic, setShowPhonetic] = useState(settings.showPhonetic);
  const [autoSpeak, setAutoSpeak] = useState(settings.autoSpeak);
  const [limit, setLimit] = useState(50);
  const [order, setOrder] = useState<WordOrder>(settings.order ?? "random");
  const [startIndex, setStartIndex] = useState(1);

  const toggleCat = (cat: string) => {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const pool = useMemo(() => {
    let list: Word[];
    if (source === "wrong") list = wrongWords;
    else if (source === "favorites") list = favoriteWords;
    else {
      const cats = selected.length ? selected : categories;
      list = words.filter(
        (w) =>
          cats.includes(w.category) && !isEasy(w.english) && !isTrashed(w.english),
      );
    }
    return sortWordsByCategoryOrder(list);
  }, [source, wrongWords, favoriteWords, selected, categories, words]);

  const start = () => {
    const n = Math.max(1, limit);
    let list: Word[];
    if (order === "random") {
      list = shuffle(pool).slice(0, n);
    } else {
      const from = Math.min(
        Math.max(0, startIndex - 1),
        Math.max(0, pool.length - 1),
      );
      list = pool.slice(from, from + n);
    }
    if (!list.length) {
      alert("当前词库为空，请先选择分类或添加单词。");
      return;
    }
    saveSettings({ accent, showPhonetic, autoSpeak, order });
    onStart({ list, mode, accent, showPhonetic, autoSpeak });
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
            <button className="btn ghost" onClick={() => setSelected(categories)}>
              全选
            </button>
            <button className="btn ghost" onClick={() => setSelected([])}>
              清空
            </button>
            <span className="muted">可多选分类</span>
          </div>
          <div className="row">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`chip ${selected.includes(cat) ? "on" : ""}`}
                onClick={() => toggleCat(cat)}
              >
                {formatCategoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row">
        <span className="muted">模式</span>
        <button
          className={`chip ${mode === "memory" ? "on" : ""}`}
          onClick={() => setMode("memory")}
        >
          记忆
        </button>
        <button
          className={`chip ${mode === "dictation" ? "on" : ""}`}
          onClick={() => setMode("dictation")}
        >
          默写
        </button>
      </div>

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
            checked={showPhonetic}
            onChange={(e) => setShowPhonetic(e.target.checked)}
          />
          显示音标
        </label>
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
            onChange={(e) => setLimit(Number(e.target.value) || 1)}
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
                const v = Number(e.target.value) || 1;
                setStartIndex(Math.max(1, v));
              }}
            />
          </label>
        )}
      </div>

      <p className="muted">
        {(() => {
          if (order === "random") {
            return `候选 ${pool.length} 词 · 将随机抽取 ${Math.min(limit, pool.length)} 词`;
          }
          const from = Math.min(Math.max(1, startIndex), Math.max(1, pool.length));
          const count = Math.min(limit, Math.max(0, pool.length - from + 1));
          return `候选 ${pool.length} 词 · 将从第 ${from} 词起按顺序取 ${count} 词`;
        })()}
        {source === "categories" && selected.length === 0
          ? "（未选分类时默认全部）"
          : ""}
      </p>

      <button className="btn primary" onClick={start}>
        开始练习
      </button>
    </div>
  );
}

export function WordsPractice({
  list,
  mode,
  accent,
  showPhonetic,
  autoSpeak,
  onBack,
  onBooksChange,
}: {
  list: Word[];
  mode: PracticeMode;
  accent: Accent;
  showPhonetic: boolean;
  autoSpeak: boolean;
  onBack: () => void;
  onBooksChange: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [phonetic, setPhonetic] = useState<PhoneticInfo>({});
  const [stats, setStats] = useState<SessionStats>({
    total: list.length,
    correct: 0,
    wrong: 0,
    skipped: 0,
  });
  const [done, setDone] = useState(false);
  const [fav, setFav] = useState(false);

  const word = list[index];

  useEffect(() => {
    if (!word) return;
    setRevealed(false);
    setInput("");
    setFeedback(null);
    setFav(isFavorite(word.english));
    setPhonetic({});

    let cancelled = false;
    const english = word.english;

    void (async () => {
      const info = await fetchPhonetics(english);
      if (cancelled) return;
      setPhonetic(info);
      if (autoSpeak) {
        await speakWord(english, accent, info);
      }
    })();

    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [word, mode, autoSpeak, accent]);

  const phoneticText =
    accent === "us" ? phonetic.us ?? phonetic.uk : phonetic.uk ?? phonetic.us;

  const next = () => {
    if (index >= list.length - 1) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
  };

  const markCorrect = () => {
    setStats((s) => ({ ...s, correct: s.correct + 1 }));
    setFeedback({ ok: true, text: "正确" });
    setTimeout(next, 450);
  };

  const markWrong = () => {
    upsertWrongWord({
      english: word.english,
      chinese: word.chinese,
      category: word.category,
    });
    void syncBooksToDisk();
    onBooksChange();
    setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
    setFeedback({
      ok: false,
      text: `错误 · 答案：${word.english}`,
    });
    setRevealed(true);
  };

  const checkDictation = () => {
    if (normalizeAnswer(input) === normalizeAnswer(word.english)) {
      markCorrect();
    } else {
      markWrong();
    }
  };

  /** Memory-mode check: wrong answers are NOT written to wrong-words.csv */
  const checkMemory = () => {
    if (normalizeAnswer(input) === normalizeAnswer(word.english)) {
      markCorrect();
      return;
    }
    setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
    setFeedback({
      ok: false,
      text: `不正确 · 答案：${word.english}（未计入错词本）`,
    });
    setRevealed(true);
  };

  const skip = () => {
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    next();
  };

  const addToEasy = () => {
    addEasy({
      english: word.english,
      chinese: word.chinese,
      category: word.category,
    });
    onBooksChange();
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    next();
  };

  const deleteWord = () => {
    addToTrash({
      english: word.english,
      chinese: word.chinese,
      category: word.category,
    });
    void syncBooksToDisk();
    onBooksChange();
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    next();
  };

  const toggleFav = () => {
    if (fav) {
      removeFavorite(word.english);
      setFav(false);
    } else {
      addFavorite({
        english: word.english,
        chinese: word.chinese,
        category: word.category,
      });
      setFav(true);
    }
    void syncBooksToDisk();
    onBooksChange();
  };

  if (done || !word) {
    const accuracy =
      stats.correct + stats.wrong === 0
        ? 0
        : Math.round((stats.correct / (stats.correct + stats.wrong)) * 100);
    return (
      <div className="panel stack">
        <h2>本轮结束</h2>
        <div className="stats">
          <div className="stat">
            <b>{stats.total}</b>
            <span>总计</span>
          </div>
          <div className="stat">
            <b>{stats.correct}</b>
            <span>正确</span>
          </div>
          <div className="stat">
            <b>{stats.wrong}</b>
            <span>错误</span>
          </div>
          <div className="stat">
            <b>{accuracy}%</b>
            <span>正确率</span>
          </div>
        </div>
        <p className="muted">错误单词已自动写入错词本（wrong-words.json）。</p>
        <button className="btn primary" onClick={onBack}>
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>
          {mode === "memory" ? "记忆模式" : "默写模式"}
        </h2>
        <button className="btn ghost" onClick={onBack}>
          结束
        </button>
      </div>

      <div className="progress">
        <i style={{ width: `${((index + 1) / list.length) * 100}%` }} />
      </div>

      <div className="stats" style={{ marginBottom: 16 }}>
        <div className="stat">
          <b>
            {index + 1}/{list.length}
          </b>
          <span>进度</span>
        </div>
        <div className="stat">
          <b>{stats.correct}</b>
          <span>正确</span>
        </div>
        <div className="stat">
          <b>{stats.wrong}</b>
          <span>错误</span>
        </div>
        <div className="stat">
          <b>{stats.skipped}</b>
          <span>跳过</span>
        </div>
      </div>

      <div className="word-stage">
        {mode === "dictation" ? (
          <>
            <p className="chinese-hero">{word.chinese}</p>
            {showPhonetic && revealed && (
              <p className="phonetic">{phoneticText ? `/${phoneticText}/` : " "}</p>
            )}
            {revealed && <p className="english-answer">{word.english}</p>}
          </>
        ) : (
          <>
            {revealed ? (
              <p className="english">{word.english}</p>
            ) : (
              <p className="english" style={{ letterSpacing: "0.2em" }}>
                ······
              </p>
            )}
            {showPhonetic && (
              <p className="phonetic">{phoneticText ? `/${phoneticText}/` : " "}</p>
            )}
            <p className="chinese">{word.chinese}</p>
          </>
        )}
        <span className="category">{formatCategoryLabel(word.category)}</span>
      </div>

      <div className="row" style={{ justifyContent: "center", marginBottom: 14 }}>
        <button
          className="btn"
          onClick={() => speakWord(word.english, accent, phonetic)}
        >
          发音（{accent === "us" ? "美" : "英"}）
        </button>
        <button className="btn" onClick={toggleFav}>
          {fav ? "取消收藏" : "加入收藏本"}
        </button>
        <button className="btn" onClick={addToEasy}>
          标为简单词
        </button>
        <button className="btn danger" onClick={deleteWord}>
          删除
        </button>
      </div>

      {mode === "dictation" && (
        <div className="stack" style={{ marginBottom: 12, alignItems: "center" }}>
          <div className="row" style={{ justifyContent: "center", width: "100%" }}>
            <input
              className="field answer-input"
              placeholder="输入英文拼写…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") checkDictation();
              }}
              autoFocus
            />
            <button className="btn primary" onClick={checkDictation}>
              检查
            </button>
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={skip}>
              跳过
            </button>
            {!revealed && (
              <button className="btn ghost" onClick={() => setRevealed(true)}>
                显示答案
              </button>
            )}
            {feedback && !feedback.ok && (
              <button className="btn primary" onClick={next}>
                下一个
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "memory" && (
        <div className="stack" style={{ marginBottom: 12, alignItems: "center" }}>
          <div className="row" style={{ justifyContent: "center", width: "100%" }}>
            <input
              className="field answer-input"
              placeholder="输入英文拼写…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") checkMemory();
              }}
              autoFocus
            />
            <button className="btn primary" onClick={checkMemory}>
              检查
            </button>
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={skip}>
              跳过
            </button>
            {!revealed ? (
              <button className="btn ghost" onClick={() => setRevealed(true)}>
                显示英文
              </button>
            ) : (
              <>
                <button className="btn primary" onClick={markCorrect}>
                  认识
                </button>
                <button className="btn danger" onClick={markWrong}>
                  不认识
                </button>
              </>
            )}
            {feedback && !feedback.ok && (
              <button className="btn primary" onClick={next}>
                下一个
              </button>
            )}
          </div>
        </div>
      )}

      <p className={`feedback ${feedback ? (feedback.ok ? "ok" : "bad") : ""}`}>
        {feedback?.text ?? " "}
      </p>
    </div>
  );
}
