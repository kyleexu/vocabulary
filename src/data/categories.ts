/** Learning-path order for categories (1-based index for memorization). */
export const CATEGORY_ORDER = [
  "Software Engineering",
  "Programming Basics",
  "Data Structures & Algorithms",
  "Operating Systems",
  "Networking & Protocols",
  "Databases",
  "Concurrency",
  "Java Ecosystem",
  "Caching",
  "Messaging",
  "Distributed Systems",
  "Architecture & Design",
  "Performance",
  "DevOps",
  "Security",
  "Testing",
  "Engineering Practices",
  "Communication",
] as const;

export type KnownCategory = (typeof CATEGORY_ORDER)[number];

const indexMap = new Map<string, number>(
  CATEGORY_ORDER.map((name, i) => [name, i + 1]),
);

/** 1-based category index; unknown categories go to the end. */
export function categoryIndex(name: string): number {
  return indexMap.get(name) ?? CATEGORY_ORDER.length + 1;
}

export function formatCategoryLabel(name: string): string {
  const n = categoryIndex(name);
  const num = String(n).padStart(2, "0");
  return `${num} · ${name}`;
}

/** Sort category names by learning-path index. */
export function sortCategories(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const d = categoryIndex(a) - categoryIndex(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

/** Sort words by category index, then English. */
export function sortWordsByCategoryOrder<T extends { category: string; english: string }>(
  words: T[],
): T[] {
  return [...words].sort((a, b) => {
    const d = categoryIndex(a.category) - categoryIndex(b.category);
    if (d !== 0) return d;
    return a.english.localeCompare(b.english);
  });
}
