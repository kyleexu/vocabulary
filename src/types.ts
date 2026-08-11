export type Accent = "us" | "uk";

export type Flag01 = 0 | 1;

export type Word = {
  /** Unique id from vocabulary.json */
  id: number;
  /** Learning-path category order */
  categoryId: number;
  category: string;
  english: string;
  chinese: string;
  /** 1 = in wrong-words book */
  isWrong: Flag01;
  /** 1 = in favorites book */
  isFavorites: Flag01;
  /** 1 = marked easy */
  isEasy: Flag01;
};

/** Practice card display: full word vs masked until hover. */
export type DisplayMode = "full" | "hidden";

export type WordOrder = "random" | "sequential";

export type PhoneticInfo = {
  us?: string;
  uk?: string;
  usAudio?: string;
  ukAudio?: string;
};

export type AppView = "home" | "words-setup" | "words-practice" | "books";
