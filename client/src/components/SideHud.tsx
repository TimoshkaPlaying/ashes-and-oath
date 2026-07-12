import { ChevronDown, ChevronUp, Crosshair, Eye, Flag, HeartPulse, Home, Shield, Square, Swords, Undo2, WifiOff, X } from 'lucide-react';
import { useRef } from 'react';
import type { EventView, GameView, QueueItemView, SquadView } from '../types/domain';

function eventTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('ru-RU', { minute: '2-digit', second: '2-digit' });
}

const EVENT_GLYPHS: Record<EventView['type'], string> = {
  info: '◆', success: '⚒', warning: '!', danger: '⚔', scout: '◉',
};

export function EventLog({ events, collapsed, onToggle }: { events: EventView[]; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`hud-panel event-log ${collapsed ? 'collapsed' : ''}`}>
      <button type="button" className="hud-panel-title" onClick={onToggle}><span>Журнал событий</span>{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      {!collapsed ? <div className="event-scroll">
        {events.length ? events.map((event) => (
          <div className={`event-row event-${event.type}`} key={event.id}>
            <i>{EVENT_GLYPHS[event.type]}</i><time>[{eventTime(event.at)}]</time><span>{event.message}</span>
          </div>
        )) : <div className="empty-log">Дозорные пока не принесли вестей.</div>}
      </div> : null}
    </aside>
  );
}

export function OpponentPanel({ game }: { game: GameView }) {
  if (game.phase === 'truce') {
    return (
      <section className="hud-panel opponent-panel opponent-hidden">
        <div className="opponent-crest">?</div>
        <div className="opponent-copy"><span>Противник</span><strong>Скрыт туманом</strong><small>Разведка начнётся после сигнала рога</small></div>
        <div className="opponent-state"><Eye size={14} /> Неизвестно</div>
      </section>
    );
  }
  return (
    <section className={`hud-panel opponent-panel ${game.opponent.connected ? '' : 'is-reconnecting'}`}>
      <div className="opponent-crest" style={{ '--enemy-color': game.opponent.color } as React.CSSProperties}>♜</div>
      <div className="opponent-copy">
        <span>Противник</span>
        <strong>{game.opponent.kingdomName}</strong>
        <small>{game.opponent.name}</small>
      </div>
      <div className="opponent-state">{game.opponent.connected ? <><i /> На связи</> : <><WifiOff size={14} /> Возвращается</>}</div>
    </section>
  );
}

const STATUS_LABELS: Record<SquadView['status'], string> = {
  forming: 'Формируется', idle: 'Ожидает приказа', moving: 'Движется', fighting: 'Сражается',
  attackingBuilding: 'Штурмует здание', retreating: 'Отступает', returning: 'Возвращается',
  healing: 'Лечится', destroyed: 'Уничтожен',
};

function totalUnits(squad: SquadView) {
  return Object.values(squad.units).reduce((sum, value) => sum + value, 0);
}

export type SquadAction = 'stop' | 'retreat' | 'attack' | 'defend' | 'hospital';

function SquadCard({ squad, selected, truce, onSelect, onAction }: {
  squad: SquadView;
  selected: boolean;
  truce: boolean;
  onSelect: () => void;
  onAction: (action: SquadAction) => void;
}) {
  const hp = Math.max(0, Math.min(100, (squad.hp / Math.max(1, squad.maxHp)) * 100));
  return (
    <article className={`squad-card ${selected ? 'selected' : ''} status-${squad.status}`} onClick={onSelect}>
      <div className="squad-number">{squad.index}</div>
      <div className="squad-avatar"><span>{squad.units.cavalry > squad.units.infantry ? '♞' : squad.units.archer > squad.units.infantry ? '🏹' : squad.units.catapult ? '☄' : '♜'}</span></div>
      <div className="squad-main">
        <div className="squad-title"><strong>{squad.name}</strong><span>{totalUnits(squad)}</span></div>
        <div className="squad-health"><i style={{ width: `${hp}%` }} /></div>
        <div className="squad-meta"><span>{STATUS_LABELS[squad.status]}</span><em>⚔ {squad.power}</em>{squad.etaSeconds ? <time>{squad.etaSeconds}с</time> : null}</div>
        <div className="composition-mini">
          {squad.units.infantry ? <span>🛡 {squad.units.infantry}</span> : null}
          {squad.units.archer ? <span>🏹 {squad.units.archer}</span> : null}
          {squad.units.cavalry ? <span>♞ {squad.units.cavalry}</span> : null}
          {squad.units.catapult ? <span>☄ {squad.units.catapult}</span> : null}
        </div>
      </div>
      <div className="squad-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => onAction('defend')} title="Защищать базу"><Shield size={14} /></button>
        <button type="button" onClick={() => onAction('attack')} disabled={truce} title={truce ? 'Недоступно во время перемирия' : 'Атаковать базу противника'}><Crosshair size={14} /></button>
        <button type="button" onClick={() => onAction('stop')} title="Остановиться"><Square size={13} /></button>
        <button type="button" onClick={() => onAction('retreat')} title="Отступить"><Undo2 size={14} /></button>
        <button type="button" onClick={() => onAction('hospital')} title="Отправить выживших в больницу"><HeartPulse size={14} /></button>
      </div>
    </article>
  );
}

export function SquadRail({ game, selectedId, collapsed, onToggle, onSelect, onAction, onCreate }: {
  game: GameView;
  selectedId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAction: (id: string, action: SquadAction) => void;
  onCreate: () => void;
}) {
  const squads = game.squads.filter((squad) => squad.ownerId === game.selfId && squad.status !== 'destroyed').slice(0, 4);
  return (
    <aside className={`hud-panel squad-rail ${collapsed ? 'collapsed' : ''}`}>
      <button type="button" className="hud-panel-title" onClick={onToggle}><span>Ваши отряды <b>{squads.length}/4</b></span>{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      {!collapsed ? <div className="squad-list">
        {squads.map((squad) => <SquadCard key={squad.id} squad={squad} selected={squad.id === selectedId} truce={game.phase === 'truce'} onSelect={() => onSelect(squad.id)} onAction={(action) => onAction(squad.id, action)} />)}
        {squads.length < 4 ? <button type="button" className="empty-squad-card" onClick={onCreate}><Swords size={18} /><span>Сформировать отряд</span><small>Свободно мест: {4 - squads.length}</small></button> : null}
      </div> : null}
    </aside>
  );
}

function QueueRow({ item, onCancel }: { item: QueueItemView; onCancel?: () => void }) {
  return (
    <div className="queue-row">
      <span className="queue-icon">{item.icon ?? '◆'}</span>
      <div><strong>{item.label}</strong><div className="queue-progress"><i style={{ width: `${item.progress * 100}%` }} /></div></div>
      <time>{item.secondsLeft > 0 ? `00:${String(item.secondsLeft).padStart(2, '0')}` : 'готово'}</time>
      {onCancel ? <button type="button" onClick={onCancel} title="Отменить обучение"><X size={14} /></button> : null}
    </div>
  );
}

export function QueuePanel({ queues, collapsed, onToggle, onCancel }: {
  queues: QueueItemView[];
  collapsed: boolean;
  onToggle: () => void;
  onCancel: (id: string) => void;
}) {
  const groups: Array<{ kind: QueueItemView['kind']; label: string }> = [
    { kind: 'training', label: 'Обучение' }, { kind: 'building', label: 'Стройка' }, { kind: 'research', label: 'Исследования' },
  ];
  return (
    <aside className={`hud-panel queue-panel ${collapsed ? 'collapsed' : ''}`}>
      <button type="button" className="hud-panel-title" onClick={onToggle}><span>Очереди <b>{queues.length}</b></span>{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      {!collapsed ? <div className="queue-groups">
        {groups.map((group) => {
          const items = queues.filter((item) => item.kind === group.kind);
          return items.length ? <section key={group.kind}><h4>{group.label} ({items.length})</h4>{items.map((item) => <QueueRow key={item.id} item={item} onCancel={item.kind === 'training' ? () => onCancel(item.id) : undefined} />)}</section> : null;
        })}
        {!queues.length ? <div className="empty-queue">Все мастера свободны.</div> : null}
      </div> : null}
    </aside>
  );
}

export function MiniMap({ game, onFocus, onHome }: { game: GameView; onFocus: (x: number, y: number) => void; onHome: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const focusFromPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onFocus(((event.clientX - rect.left) / rect.width) * 2048, ((event.clientY - rect.top) / rect.height) * 1152);
  };
  return (
    <aside className="hud-panel minimap-panel">
      <div className="minimap" ref={mapRef} onClick={focusFromPointer} role="button" tabIndex={0} aria-label="Мини-карта, нажмите для перемещения камеры" onKeyDown={(event) => event.key === 'Enter' && onHome()}>
        <img src="/assets/battlefield.png" alt="" />
        <div className="minimap-fog" data-truce={game.phase === 'truce'} />
        {game.squads.filter((squad) => squad.visible).map((squad) => <i key={squad.id} className={squad.ownerId === game.selfId ? 'own' : 'enemy'} style={{ left: `${(squad.x / 2048) * 100}%`, top: `${(squad.y / 1152) * 100}%` }} />)}
        <span className="minimap-viewport" />
      </div>
      <div className="minimap-tools">
        <button type="button" onClick={onHome} title="К своей базе"><Home size={17} /></button>
        <button type="button" onClick={() => game.squads.find((squad) => squad.ownerId === game.selfId) && onFocus(game.squads.find((squad) => squad.ownerId === game.selfId)!.x, game.squads.find((squad) => squad.ownerId === game.selfId)!.y)} title="К армии"><Flag size={17} /></button>
        <button type="button" onClick={() => onFocus(1024, 576)} title="Центр арены"><Eye size={17} /></button>
      </div>
    </aside>
  );
}
