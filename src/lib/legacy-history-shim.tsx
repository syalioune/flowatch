// SPDX-License-Identifier: Apache-2.0

/**
 * DELETE-WITH-STORY-13.3: this shim lets `/history?type={activities|variables|tasks}`
 * keep working while the migration from the legacy <History> component
 * (src/screens.tsx) to canonical-archetype loaders is in progress. When
 * 13.3 migrates the Variables + Tasks tabs (and decides the Activities
 * tab's fate), delete this file + the legacy `History` block from
 * `src/screens.tsx`.
 *
 * The parent /history route owns navigation between tabs — the shim does
 * NOT plumb `onTypeChange`. To avoid two `<seg-row>` rows rendering on
 * the page (the parent's canonical + the legacy History's internal), the
 * shim wraps the child in `data-suppress-internal-seg-row="1"` and emits
 * a one-rule inline `<style>` block that hides the first `.seg-row` it
 * finds inside that wrapper. The legacy `<History>` keeps working when
 * mounted outside the shim (no callers exist post-13.1, but the contract
 * stays stable).
 */

import { History, type HistoryType } from "../screens";

interface Props {
  type: HistoryType;
}

export function LegacyHistoryShim({ type }: Props) {
  return (
    <div data-suppress-internal-seg-row="1" data-testid="legacy-history-shim">
      <style>{`[data-suppress-internal-seg-row="1"] > .page > .seg-row:first-of-type { display: none; }`}</style>
      <History initialType={type} />
    </div>
  );
}
