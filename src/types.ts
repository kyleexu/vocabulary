export type Accent = "us" | "uk";

export type Word = {
  category: string;
  english: string;
  chinese: string;
};

export type WordEntry = {
  english: string;
  chinese: string;
  category?: string;
  addedAt: string;
  wrongCount?: number;
};

export type PhoneticInfo = {
  us?: string;
  uk?: string;
  usAudio?: string;
  ukAudio?: string;
};

export type PracticeMode = "memory" | "dictation";

export type WordOrder = "random" | "sequential";

export type SessionStats = {
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
};

export type AppView = "home" | "words-setup" | "words-practice" | "books";
