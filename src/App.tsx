import { useEffect, useState } from "react";
import type { Accent, Word } from "./types";
import { WordsPractice, WordsSetup } from "./components/Words";
import { WordBooks } from "./components/WordBooks";
import {
  getEasyWords,
  getFavorites,
  getVocabulary,
  getWrongWords,
  loadVocabularyFromDisk,
} from "./lib/storage";
import "./styles.css";

type View = "home" | "words-setup" | "words-practice" | "books";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [words, setWords] = useState<Word[]>([]);
  const [wrong, setWrong] = useState<Word[]>([]);
  const [favorites, setFavorites] = useState<Word[]>([]);
  const [easy, setEasy] = useState<Word[]>([]);
  const [practiceList, setPracticeList] = useState<Word[]>([]);
  const [practiceMeta, setPracticeMeta] = useState<{
    accent: Accent;
    showPhonetic: boolean;
    autoSpeak: boolean;
  } | null>(null);

  const refreshFromStore = () => {
    const list = getVocabulary();
    setWords([...list]);
    setWrong(getWrongWords());
    setFavorites(getFavorites());
    setEasy(getEasyWords());
  };

  useEffect(() => {
    void (async () => {
      await loadVocabularyFromDisk();
      refreshFromStore();
    })();
  }, []);

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
            <h1>把词汇练进肌肉记忆</h1>
          </section>
          <div className="grid-home">
            <button className="tile" onClick={() => setView("words-setup")}>
              <h2>背单词</h2>
            </button>
            <button className="tile" onClick={() => setView("books")}>
              <h2>词本</h2>
              <p>
                错词本 {wrong.length} · 收藏本 {favorites.length} · 简单词{" "}
                {easy.length}
              </p>
            </button>
          </div>
        </>
      )}

      {view === "words-setup" && (
        <WordsSetup
          words={words}
          wrongWords={wrong}
          favoriteWords={favorites}
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
          onBooksChange={refreshFromStore}
        />
      )}

      {view === "books" && (
        <WordBooks
          wrong={wrong}
          favorites={favorites}
          easy={easy}
          onChange={refreshFromStore}
          onBack={() => setView("home")}
        />
      )}
    </div>
  );
}
