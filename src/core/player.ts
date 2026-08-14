export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  icon: string;
  color: string;
  gold: number;
  influence: number;
  morale: number;
  isHuman: boolean;
}

export function createPlayer(
  id: PlayerId,
  name: string,
  color: string,
  options?: Partial<Pick<Player, 'icon' | 'gold' | 'influence' | 'morale' | 'isHuman'>>,
): Player {
  return {
    id,
    name,
    icon: options?.icon ?? '◆',
    color,
    gold: options?.gold ?? 100,
    influence: options?.influence ?? 20,
    morale: options?.morale ?? 0.6,
    isHuman: options?.isHuman ?? true,
  };
}

export function createDefaultPlayers(): Player[] {
  return [
    createPlayer('player-red', 'レッド王国', '#ff6b6b', { icon: '👑', gold: 120, influence: 28, morale: 0.7, isHuman: true }),
    createPlayer('player-blue', 'ブルー連合', '#4dabf7', { icon: '🛡️', gold: 110, influence: 24, morale: 0.65, isHuman: true }),
    createPlayer('player-gold', 'ゴールド商盟', '#f4c95d', { icon: '💰', gold: 130, influence: 26, morale: 0.68, isHuman: false }),
  ];
}
