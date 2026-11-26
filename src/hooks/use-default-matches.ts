import { useEffect } from 'react';

import type { Part, ReviewItem } from '@/lib/db';
import { defaultTarget } from '@/lib/parts';

export type MatchedRow = ReviewItem & { matchChecked?: boolean };

/**
 * Once the inventory has loaded, pre-select an identical-name match for each review row, once per row:
 * choosing "Keep separate" afterwards sticks.
 */
export function useDefaultMatches<R extends MatchedRow>(inventory: Part[] | null, rows: R[], setRows: (update: (rows: R[]) => R[]) => void) {
  const pending = inventory !== null && rows.some((r) => !r.matchChecked);
  useEffect(() => {
    if (!pending || !inventory) return;
    setRows((rs) => rs.map((r) => (r.matchChecked ? r : { ...r, matchChecked: true, target: r.target ?? defaultTarget(r, inventory) })));
  }, [pending, inventory, setRows]);
}
