export type PlayerId = string;
export type AiBehavior = 'balanced' | 'aggressive' | 'economic';

export interface Player {
  id: PlayerId;
  name: string;
  icon: string;
  color: string;
  gold: number;
  influence: number;
  morale: number;
  military: number;
  actionPoints: number;
  maxActionPoints: number;
  isHuman: boolean;
  aiBehavior: AiBehavior;
}

export function createPlayer(
  id: PlayerId,
  name: string,
  color: string,
  options?: Partial<Pick<Player, 'icon' | 'gold' | 'influence' | 'morale' | 'military' | 'actionPoints' | 'maxActionPoints' | 'isHuman' | 'aiBehavior'>>,
): Player {
  return {
    id,
    name,
    icon: options?.icon ?? '◆',
    color,
    gold: options?.gold ?? 100,
    influence: options?.influence ?? 20,
    morale: options?.morale ?? 0.6,
    military: options?.military ?? 25,
    actionPoints: options?.actionPoints ?? 2,
    maxActionPoints: options?.maxActionPoints ?? 2,
    isHuman: options?.isHuman ?? true,
    aiBehavior: options?.aiBehavior ?? 'balanced',
  };
}

export function createDefaultPlayers(): Player[] {
  return [
    createPlayer('player-red', 'レッド王国', '#ff3b8a', { icon: '👑', gold: 120, influence: 28, morale: 0.7, military: 30, actionPoints: 4, maxActionPoints: 4, isHuman: true, aiBehavior: 'balanced' }),
    createPlayer('player-blue', 'ブルー連合', '#00c2ff', { icon: '🛡️', gold: 110, influence: 24, morale: 0.65, military: 28, actionPoints: 4, maxActionPoints: 4, isHuman: true, aiBehavior: 'aggressive' }),
    createPlayer('player-gold', 'ゴールド商盟', '#ff8a2b', { icon: '💰', gold: 130, influence: 26, morale: 0.68, military: 22, actionPoints: 4, maxActionPoints: 4, isHuman: false, aiBehavior: 'economic' }),
  ];
}
