/** Format "01 · Software Engineering" from CSV categoryId. */
export function formatCategoryLabel(category: string, categoryId?: number): string {
  if (categoryId != null && categoryId > 0) {
    return `${String(categoryId).padStart(2, "0")} · ${category}`;
  }
  return category;
}

/** Unique categories in CSV order (by categoryId). */
export function categoriesFromWords(
  words: Array<{ category: string; categoryId: number }>,
): Array<{ categoryId: number; category: string }> {
  const map = new Map<string, number>();
  for (const w of words) {
    if (!map.has(w.category)) map.set(w.category, w.categoryId);
  }
  return [...map.entries()]
    .map(([category, categoryId]) => ({ category, categoryId }))
    .sort((a, b) => a.categoryId - b.categoryId || a.category.localeCompare(b.category));
}

/** Preserve CSV file order: categoryId, then word id. */
export function sortWordsByCsvOrder<
  T extends { id?: number; categoryId?: number; english?: string },
>(words: T[]): T[] {
  return [...words].sort((a, b) => {
    const cd = (a.categoryId ?? 9999) - (b.categoryId ?? 9999);
    if (cd !== 0) return cd;
    const ida = a.id ?? Number.MAX_SAFE_INTEGER;
    const idb = b.id ?? Number.MAX_SAFE_INTEGER;
    if (ida !== idb) return ida - idb;
    return (a.english ?? "").localeCompare(b.english ?? "");
  });
}
