/**
 * Semantic presentation payloads for MCP tools (see doc.md).
 * Shape data for AI clients to render as tables/cards — not raw API dumps.
 */

export type PresentColumn = { key: string; label: string };

export type PresentTable = {
  content: {
    type: 'table';
    title: string;
    columns: PresentColumn[];
    rows: Record<string, string | number | boolean | null>[];
    empty?: string;
  };
  meta?: Record<string, unknown>;
};

export type PresentCard = {
  content: {
    type: 'card' | 'details';
    title: string;
    fields: { label: string; value: string | number | boolean | null }[];
  };
  meta?: Record<string, unknown>;
};

const PRESENT_HINT =
  'Present as a Markdown table using content.columns and content.rows. Do not dump raw JSON unless the user asks. If rows are empty, show content.empty.';

export function tablePayload(input: {
  title: string;
  columns: PresentColumn[];
  rows: Record<string, string | number | boolean | null>[];
  empty?: string;
  meta?: Record<string, unknown>;
}): PresentTable & { _present: string } {
  return {
    content: {
      type: 'table',
      title: input.title,
      columns: input.columns,
      rows: input.rows,
      empty: input.empty ?? 'Nothing to show.',
    },
    meta: input.meta,
    _present: PRESENT_HINT,
  };
}

export function clip(s: unknown, max = 120): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function asList<T>(raw: unknown, key: string): T[] {
  if (!raw || typeof raw !== 'object') return [];
  const v = (raw as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
