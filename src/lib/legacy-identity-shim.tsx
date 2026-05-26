// SPDX-License-Identifier: Apache-2.0

/**
 * Transitional shim — mounts the legacy `<Identity>` component for the
 * Groups tab while Story 14.1 migrates the Users tab to the canonical
 * archetype. Story 14.2's `chore(refactor):` follow-up commit deletes
 * this file alongside the legacy `<Identity>` body in `src/screens.tsx`.
 *
 * Precedent: Story 13.1's <LegacyHistoryShim>, removed by 13.3's
 * chore(refactor) commit (87b9f98). See CLAUDE.md "<LegacyXxxShim>
 * transitional-migration pattern for multi-tab screens."
 */

import { useNavigate } from "@tanstack/react-router";
import { Identity } from "../screens";

export interface LegacyIdentityShimProps {
  type: "groups";
}

export function LegacyIdentityShim({ type }: LegacyIdentityShimProps) {
  const navigate = useNavigate({ from: "/identity/" });
  return (
    <Identity
      initialTab={type}
      onTabChange={(v) => navigate({ search: (prev) => ({ ...prev, tab: v }) })}
    />
  );
}

export default LegacyIdentityShim;
