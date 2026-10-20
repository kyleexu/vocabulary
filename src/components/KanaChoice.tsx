import { useEffect, useMemo, useRef, useState } from "react";
import type { Accent, SpeakMode, Word } from "../types";
import {
  AUTO_ADVANCE_DELAY_CHOICES,
  getSettings,
  saveSettings,
  setEasy,
  setFavorite,
  setWrong,
  SPEAK_RATE_CHOICES,
} from "../lib/storage";
import { kanaParts, pickKanaChoices } from "../lib/kana";
import { speakWord, stopSpeaking } from "../lib/speech";

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

function speakAccent(mode: SpeakMode): Accent {
  return mode === "uk" ? "uk" : "us";
}

export function KanaChoicePractice({
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
  const [speakMode, setSpeakMode] = useState<SpeakMode>(
    settings.speakMode === "off" ? "us" : settings.speakMode,
  );
  const [speakRate, setSpeakRate] = useState(settings.speakRate);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoAdvanceDelayMs, setAutoAdvanceDelayMs] = useState(
    settings.autoAdvanceDelayMs,
  );
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [inWrong, setInWrong] = useState(false);
  const [inEasy, setInEasy] = useState(false);
  const [inFav, setInFav] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState("");
  const advanceTimerRef = useRef(0);

  const word = list[index];
  const accent = speakAccent(speakMode);
  const autoSpeak = speakMode !== "off";
  const locked = pickedId != null;

  const choices = useMemo(() => {
    if (!word) return [];
    return pickKanaChoices(word, list);
  }, [word?.id, list]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1400);
  };

  const clearAdvanceTimer = () => {
    window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = 0;
  };

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

  useEffect(() => {
    if (!word) return;
    setPickedId(null);
    setToast("");
    clearAdvanceTimer();
  }, [word?.id]);

  useEffect(() => {
    if (!word) return;
    setInWrong(word.isWrong === 1);
    setInEasy(word.isEasy === 1);
    setInFav(word.isFavorites === 1);
  }, [word?.id, word?.isWrong, word?.isEasy, word?.isFavorites]);

  useEffect(() => {
    if (!word) return;
    const speakT = autoSpeak
      ? window.setTimeout(() => {
          void speakWord(word, accent, speakRate);
        }, 80)
      : 0;
    return () => {
      window.clearTimeout(speakT);
      stopSpeaking();
    };
  }, [word?.id, autoSpeak, accent, speakRate]);

  useEffect(() => {
    if (done || !word || locked) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void speakWord(word, accent, speakRate);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        if (index > 0) prev();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        next();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) {
        e.preventDefault();
        choose(choices[n - 1]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, word, locked, choices, accent, speakRate, index, list.length]);

  const changeSpeakMode = (mode: SpeakMode) => {
    setSpeakMode(mode);
    saveSettings({ ...getSettings(), speakMode: mode });
  };

  const changeSpeakRate = (rate: number) => {
    setSpeakRate(rate);
    saveSettings({ ...getSettings(), speakRate: rate });
  };

  const choose = (option: Word) => {
    if (!word || locked) return;
    setPickedId(option.id);
    const ok = option.id === word.id;
    setToast(ok ? "正确" : "再试一次");
    if (ok && autoAdvance) {
      clearAdvanceTimer();
      advanceTimerRef.current = window.setTimeout(next, autoAdvanceDelayMs);
    }
  };

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
            <span className="control-label">听音选假名</span>
          </div>
          <div className="control-group">
            <span className="control-label">发音配置</span>
            {(
              [
                ["off", "不发音"],
                ["us", "朗读"],
              ] as const
            ).map(([mode, label]) => (
              <label key={mode} className="choice">
                <input
                  type="radio"
                  name="kanaSpeakMode"
                  checked={
                    mode === "off" ? speakMode === "off" : speakMode !== "off"
                  }
                  onChange={() => changeSpeakMode(mode)}
                />
                {label}
              </label>
            ))}
            <label className="speak-rate">
              <span className="control-label">语速</span>
              <select
                className="rate-select"
                value={speakRate}
                onChange={(e) => changeSpeakRate(Number(e.target.value))}
              >
                {SPEAK_RATE_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="control-group">
            <label className="choice">
              答对自动下一词
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => {
                  setAutoAdvance(e.target.checked);
                  saveSettings({
                    ...getSettings(),
                    autoAdvance: e.target.checked,
                  });
                }}
              />
            </label>
            <select
              className="rate-select"
              value={autoAdvanceDelayMs}
              disabled={!autoAdvance}
              onChange={(e) => {
                const ms = Number(e.target.value);
                setAutoAdvanceDelayMs(ms);
                saveSettings({ ...getSettings(), autoAdvanceDelayMs: ms });
              }}
            >
              {AUTO_ADVANCE_DELAY_CHOICES.map((ms) => (
                <option key={ms} value={ms}>
                  {ms / 1000}s
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <div className="progress">
        <i style={{ width: `${((index + 1) / list.length) * 100}%` }} />
      </div>
      <p className="muted" style={{ marginTop: 0, textAlign: "center" }}>
        {index + 1} / {list.length}
      </p>

      <div className="flash-stage">
        <div className="flash-word-row">
          <p className="kana-romaji">{word.english}</p>
          <button
            type="button"
            className="speak-btn"
            title="发音"
            onClick={() => void speakWord(word, accent, speakRate)}
          >
            <SpeakerIcon />
          </button>
        </div>
        <p className="flash-pos">词性 · {word.pos || "—"}</p>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          选出对应的平假名 / 片假名（按 1–{choices.length}）
        </p>
        <div className="kana-choice-grid">
          {choices.map((option, i) => {
            const { hira, kata } = kanaParts(option.chinese);
            const isCorrect = option.id === word.id;
            const isPicked = option.id === pickedId;
            let state = "";
            if (locked) {
              if (isCorrect) state = "ok";
              else if (isPicked) state = "bad";
            }
            return (
              <button
                key={option.id}
                type="button"
                className={`kana-choice ${state}`}
                disabled={locked}
                onClick={() => choose(option)}
              >
                <span className="kana-choice-index">{i + 1}</span>
                <span className="kana-choice-hira">{hira || option.chinese}</span>
                {kata ? <span className="kana-choice-kata">{kata}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <p
        className={`feedback ${
          toast
            ? toast === "正确" || toast.startsWith("已")
              ? "ok"
              : toast === "再试一次"
                ? "bad"
                : "ok"
            : ""
        }`}
      >
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
