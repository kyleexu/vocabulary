import { useEffect, useMemo, useState } from "react";
import type { Accent, Word, WordEntry } from "./types";
import { WordsPractice, WordsSetup } from "./components/Words";
import { WordBooks } from "./components/WordBooks";
import {
  getEasyWords,
  getFavorites,
  getWrongWords,
  loadBooksFromDisk,
  syncBooksToDisk,
} from "./lib/storage";
import "./styles.css";

type View = "home" | "words-setup" | "words-practice" | "books";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [words, setWords] = useState<Word[]>([]);
  const [wrong, setWrong] = useState<WordEntry[]>([]);
  const [favorites, setFavorites] = useState<WordEntry[]>([]);
  const [easy, setEasy] = useState<WordEntry[]>([]);
  const [practiceList, setPracticeList] = useState<Word[]>([]);
  const [practiceMeta, setPracticeMeta] = useState<{
    accent: Accent;
    showPhonetic: boolean;
    autoSpeak: boolean;
  } | null>(null);

  const refreshBooks = () => {
    setWrong(getWrongWords());
    setFavorites(getFavorites());
    setEasy(getEasyWords());
  };

  useEffect(() => {
    void (async () => {
      await loadBooksFromDisk();
      refreshBooks();
      await syncBooksToDisk();
    })();
    fetch("/data/vocabulary.json")
      .then((r) => r.json())
      .then((data: Word[]) => setWords(data))
      .catch(() => setWords([]));
  }, []);

  const wrongAsWords: Word[] = useMemo(
    () =>
      wrong.map((w) => ({
        id: w.id ?? 0,
        categoryId: w.categoryId ?? 9999,
        english: w.english,
        chinese: w.chinese,
        category: w.category ?? "Wrong Words",
      })),
    [wrong],
  );

  const favAsWords: Word[] = useMemo(
    () =>
      favorites.map((w) => ({
        id: w.id ?? 0,
        categoryId: w.categoryId ?? 9999,
        english: w.english,
        chinese: w.chinese,
        category: w.category ?? "Favorites",
      })),
    [favorites],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>Vocabulary Trainer</strong>
          <span>背单词 · 词本</span>
        </div>
        <nav className="nav">
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => setView("home")}
          >
            首页
          </button>
          <button
            className={view.startsWith("words") ? "active" : ""}
            onClick={() => setView("words-setup")}
          >
            背单词
          </button>
          <button
            className={view === "books" ? "active" : ""}
            onClick={() => setView("books")}
          >
            词本
          </button>
        </nav>
      </header>

      {view === "home" && (
        <>
          <section className="hero">
            <h1>把专业词汇练进肌肉记忆</h1>
            <p>
              展示 / 隐藏模式复习；按分类抽词；错词、收藏与简单词保存在{" "}
              <code>data/</code>。
            </p>
          </section>
          <div className="grid-home">
            <button className="tile" onClick={() => setView("words-setup")}>
              <h2>背单词</h2>
              <p>展示与隐藏悬停 · 音标发音 · 多分类随机/顺序</p>
            </button>
            <button className="tile" onClick={() => setView("books")}>
              <h2>词本</h2>
              <p>
                错词本 {wrong.length} · 收藏本 {favorites.length} · 简单词{" "}
                {easy.length}
              </p>
            </button>
          </div>
          <p className="muted" style={{ marginTop: 22 }}>
            词库已加载 {words.length} 词
          </p>
        </>
      )}

      {view === "words-setup" && (
        <WordsSetup
          words={words}
          wrongWords={wrongAsWords}
          favoriteWords={favAsWords}
          onBack={() => setView("home")}
          onStart={({ list, accent, showPhonetic, autoSpeak }) => {
            setPracticeList(list);
            setPracticeMeta({ accent, showPhonetic, autoSpeak });
            setView("words-practice");
          }}
        />
      )}

      {view === "words-practice" && practiceMeta && (
        <WordsPractice
          list={practiceList}
          accent={practiceMeta.accent}
          showPhonetic={practiceMeta.showPhonetic}
          autoSpeak={practiceMeta.autoSpeak}
          onBack={() => setView("words-setup")}
          onBooksChange={refreshBooks}
        />
      )}

      {view === "books" && (
        <WordBooks
          wrong={wrong}
          favorites={favorites}
          easy={easy}
          onChange={refreshBooks}
          onBack={() => setView("home")}
        />
      )}
    </div>
  );
}
