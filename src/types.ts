export type Accent = "us" | "uk";

export type Word = {
  /** Unique id from vocabulary.csv */
  id: number;
  /** Learning-path category order from vocabulary.csv */
  categoryId: number;
  category: string;
  english: string;
  chinese: string;
};

export type WordEntry = {
  /** Vocabulary word id when known */
  id?: number;
  categoryId?: number;
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

/** Practice card display: full word vs masked until hover. */
export type DisplayMode = "full" | "hidden";

export type WordOrder = "random" | "sequential";

export type AppView = "home" | "words-setup" | "words-practice" | "books";
