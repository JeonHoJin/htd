import { MAX_TIER, MYTHICS } from './balance';

// 유닛 종류를 정수 하나로 표현한다.
// 일반: element * MAX_TIER + (tier - 1)  → 0..29
// 신화: REGULAR_KINDS + mythicIndex
export const REGULAR_KINDS = 6 * MAX_TIER;
export const KIND_COUNT = REGULAR_KINDS + MYTHICS.length;
export const EMPTY = -1;

export const kindOf = (element: number, tier: number) => element * MAX_TIER + (tier - 1);
export const mythicKind = (index: number) => REGULAR_KINDS + index;
export const isMythic = (kind: number) => kind >= REGULAR_KINDS;
export const isValidKind = (kind: number) => Number.isInteger(kind) && kind >= 0 && kind < KIND_COUNT;
export const mythicIndex = (kind: number) => kind - REGULAR_KINDS;

/** 신화는 -1 */
export const kindElement = (kind: number) => (isMythic(kind) ? -1 : Math.floor(kind / MAX_TIER));
/** 신화는 MAX_TIER + 1 */
export const kindTier = (kind: number) => (isMythic(kind) ? MAX_TIER + 1 : (kind % MAX_TIER) + 1);
export const canMerge = (kind: number) => !isMythic(kind) && kindTier(kind) < MAX_TIER;
