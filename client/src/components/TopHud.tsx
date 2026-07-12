import { Coins, Menu, Mountain, Pickaxe, Settings, TreePine, Users, Wheat } from 'lucide-react';
import { RESOURCE_LABELS, RESOURCE_ORDER } from '../data/gameData';
import type { ConnectionState, GameView, ResourceKey } from '../types/domain';

const RESOURCE_ICONS: Record<ResourceKey, typeof TreePine> = {
  wood: TreePine,
  stone: Mountain,
  gold: Coins,
  iron: Pickaxe,
  food: Wheat,
};

function compact(value: number) {
  return Math.floor(value).toLocaleString('ru-RU');
}

export function TopHud({ game, connection, ping, onSettings, onMenu }: {
  game: GameView;
  connection: ConnectionState;
  ping: number | null;
  onSettings: () => void;
  onMenu: () => void;
}) {
  return (
    <header className="top-hud">
      <div className="hud-logo"><span>ПЕПЕЛ</span><i>И</i><span>КЛЯТВА</span><b>⚔</b></div>
      <div className="resource-ribbon">
        {RESOURCE_ORDER.map((key) => {
          const resource = game.resources[key];
          const Icon = RESOURCE_ICONS[key];
          const capped = resource.amount >= resource.capacity;
          return (
            <div className={`resource-cell ${capped ? 'is-capped' : ''}`} key={key} title={`${RESOURCE_LABELS[key]}: ${compact(resource.amount)} из ${compact(resource.capacity)}, производство ${resource.perMinute} в минуту`}>
              <Icon size={20} />
              <div><span>{RESOURCE_LABELS[key]}</span><strong>{compact(resource.amount)} <i>/ {compact(resource.capacity)}</i></strong></div>
              <em>{capped ? 'СКЛАД ПОЛОН' : `+${compact(resource.perMinute)}/мин`}</em>
            </div>
          );
        })}
        <div className="resource-cell population-cell" title="Свободное население и общий предел">
          <Users size={21} />
          <div><span>Население</span><strong>{game.self.population} <i>/ {game.self.populationCap}</i></strong></div>
          <em>свободно</em>
        </div>
      </div>
      <div className="top-actions">
        <div className={`hud-network ${connection}`} title="Задержка соединения"><i>▂▄▆</i>{ping === null ? '—' : `${ping}мс`}</div>
        <button type="button" onClick={onSettings} aria-label="Настройки"><Settings size={19} /></button>
        <button type="button" onClick={onMenu} aria-label="Меню"><Menu size={20} /></button>
      </div>
    </header>
  );
}

export function TruceBanner({ phase, seconds }: { phase: GameView['phase']; seconds: number }) {
  if (phase === 'finished') return null;
  if (phase === 'lastBattle') {
    return (
      <div className="truce-banner last-battle-banner">
        <span>☠ Последняя битва ☠</span>
        <strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong>
        <small>Карта открыта · урон увеличен</small>
      </div>
    );
  }
  if (phase !== 'truce') return null;
  return (
    <div className={`truce-banner ${seconds <= 5 ? 'ending' : ''}`}>
      <span>∞ ⚔ Перемирие ⚔ ∞</span>
      <strong>00:{String(seconds).padStart(2, '0')}</strong>
      <small>Атака недоступна до окончания перемирия</small>
    </div>
  );
}
