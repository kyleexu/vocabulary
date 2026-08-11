import { useEffect, useMemo, useState } from "react";
import type { Accent, Word } from "./types";
import { WordsPractice, WordsSetup } from "./components/Words";
import { WordBooks } from "./components/WordBooks";
import { loadVocabularyFromDisk } from "./lib/storage";
import "./styles.css";

type View = "home" | "words-setup" | "words-practice" | "books";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [words, setWords] = useState<Word[]>([]);
  const [practiceList, setPracticeList] = useState<Word[]>([]);
  const [practiceMeta, setPracticeMeta] = useState<{
    accent: Accent;
    autoSpeak: boolean;
  } | null>(null);

  const wrong = useMemo(() => words.filter((w) => w.isWrong === 1), [words]);
  const favorites = useMemo(
    () => words.filter((w) => w.isFavorites === 1),
    [words],
  );
  const easy = useMemo(() => words.filter((w) => w.isEasy === 1), [words]);

  const patchWord = (updated: Word) => {
    setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    setPracticeList((prev) =>
      prev.map((w) => (w.id === updated.id ? updated : w)),
    );
  };

  useEffect(() => {
    void (async () => {
      try {
        setWords(await loadVocabularyFromDisk());
      } catch (err) {
        console.error(err);
        setWords([]);
      }
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
          onStart={({ list, accent, autoSpeak }) => {
            setPracticeList(list);
            setPracticeMeta({ accent, autoSpeak });
            setView("words-practice");
          }}
        />
      )}

      {view === "words-practice" && practiceMeta && (
        <WordsPractice
          list={practiceList}
          accent={practiceMeta.accent}
          autoSpeak={practiceMeta.autoSpeak}
          onBack={() => setView("words-setup")}
          onWordPatched={patchWord}
        />
      )}

      {view === "books" && (
        <WordBooks
          words={words}
          wrong={wrong}
          favorites={favorites}
          easy={easy}
          onWordPatched={patchWord}
          onImported={setWords}
          onBack={() => setView("home")}
        />
      )}
    </div>
  );
}
