import { useEffect, useMemo, useState } from "react";
import type { AppView, Word } from "./types";
import { Login } from "./components/Login";
import { WordsPractice, WordsSetup } from "./components/Words";
import { WordBooks } from "./components/WordBooks";
import { VocabFiles } from "./components/VocabFiles";
import { WordLookup } from "./components/WordLookup";
import { isAuthenticated, logout } from "./lib/auth";
import {
  getDataFile,
  loadVocabularyFromDisk,
  resolveDataFile,
  setDataFile,
} from "./lib/storage";
import "./styles.css";

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [view, setView] = useState<AppView>("home");
  const [words, setWords] = useState<Word[]>([]);
  const [practiceList, setPracticeList] = useState<Word[]>([]);
  const [dataFile, setDataFileState] = useState(getDataFile);
  const [switching, setSwitching] = useState(false);

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

  const addWord = (created: Word) => {
    setWords((prev) => [...prev, created]);
  };

  const switchDataFile = async (file: string) => {
    if (file === dataFile) return;
    setSwitching(true);
    try {
      const next = await loadVocabularyFromDisk(file);
      setDataFile(file);
      setDataFileState(file);
      setPracticeList([]);
      setWords(next);
    } catch (err) {
      console.error(err);
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    if (!authed) return;
    void (async () => {
      try {
        const file = await resolveDataFile();
        setDataFileState(file);
        setWords(await loadVocabularyFromDisk(file));
      } catch (err) {
        console.error(err);
        setWords([]);
      }
    })();
  }, [authed]);

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  const handleLogout = () => {
    logout();
    setAuthed(false);
    setView("home");
    setWords([]);
    setPracticeList([]);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>Vocabulary Trainer</strong>
          <span>背单词 · 查词 · 词本 · {dataFile}</span>
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
            className={view === "lookup" ? "active" : ""}
            onClick={() => setView("lookup")}
          >
            查词
          </button>
          <button
            className={view === "books" ? "active" : ""}
            onClick={() => setView("books")}
          >
            词本
          </button>
          <button
            className={view === "files" ? "active" : ""}
            onClick={() => setView("files")}
          >
            词库
          </button>
          <button type="button" className="nav-logout" onClick={handleLogout}>
            退出
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
            <button className="tile" onClick={() => setView("lookup")}>
              <h2>查词 / 加词</h2>
              <p>搜索当前词库，或手动添加单词</p>
            </button>
            <button className="tile" onClick={() => setView("books")}>
              <h2>词本</h2>
              <p>
                错词本 {wrong.length} · 收藏本 {favorites.length} · 简单词{" "}
                {easy.length}
              </p>
            </button>
            <button className="tile" onClick={() => setView("files")}>
              <h2>词库</h2>
              <p>当前 {dataFile} · {words.length} 词</p>
            </button>
          </div>
        </>
      )}

      {view === "words-setup" && (
        <WordsSetup
          words={words}
          wrongWords={wrong}
          favoriteWords={favorites}
          easyWords={easy}
          onBack={() => setView("home")}
          onStart={({ list }) => {
            setPracticeList(list);
            setView("words-practice");
          }}
        />
      )}

      {view === "words-practice" && (
        <WordsPractice
          list={practiceList}
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

      {view === "files" && (
        <VocabFiles
          currentFile={dataFile}
          wordCount={words.length}
          switching={switching}
          onSelect={(file) => void switchDataFile(file)}
          onBack={() => setView("home")}
        />
      )}

      {view === "lookup" && (
        <WordLookup
          words={words}
          onWordAdded={addWord}
          onBack={() => setView("home")}
        />
      )}
    </div>
  );
}
