import { Castle, Clock3, Flame, Hammer, Home, RotateCcw, ScrollText, Shield, Skull, Swords, Trophy, Users } from 'lucide-react';
import type { GameView } from '../types/domain';
import { OrnateCorners } from './Common';

function duration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ResultsScreen({ game, onRematch, onMenu }: { game: GameView; onRematch: () => void; onMenu: () => void }) {
  const victory = game.winnerId === game.selfId;
  const stats = game.stats;
  const rows = [
    { icon: Clock3, label: 'Длительность матча', value: duration(stats?.durationSeconds ?? 0) },
    { icon: Flame, label: 'Добыто ресурсов', value: (stats?.resourcesGathered ?? 0).toLocaleString('ru-RU') },
    { icon: Hammer, label: 'Построено зданий', value: stats?.buildingsBuilt ?? 0 },
    { icon: Users, label: 'Обучено войск', value: stats?.unitsTrained ?? 0 },
    { icon: Skull, label: 'Потеряно войск', value: stats?.unitsLost ?? 0 },
    { icon: Swords, label: 'Уничтожено врагов', value: stats?.unitsKilled ?? 0 },
    { icon: Shield, label: 'Нанесено урона', value: (stats?.damageDealt ?? 0).toLocaleString('ru-RU') },
    { icon: Castle, label: 'Разрушено зданий', value: stats?.buildingsDestroyed ?? 0 },
    { icon: ScrollText, label: 'Исследований', value: stats?.researchCompleted ?? 0 },
  ];
  return (
    <main className={`results-screen ${victory ? 'victory' : 'defeat'}`}>
      <div className="results-bg" />
      <div className="results-effects"><i /><i /><i /><i /><i /></div>
      <section className="results-card iron-panel">
        <OrnateCorners />
        <div className="results-emblem">{victory ? <Trophy size={52} /> : <Skull size={52} />}</div>
        <span className="results-kicker">{victory ? 'Клятва исполнена' : 'Корона обращена в пепел'}</span>
        <h1>{victory ? 'Победа' : 'Поражение'}</h1>
        <p>{victory ? `${game.opponent.kingdomName} пало перед знаменем ${game.self.kingdomName}.` : `${game.self.kingdomName} будет отстроено вновь. Ваша клятва ещё не окончена.`}</p>
        <div className="results-grid">{rows.map(({ icon: Icon, label, value }) => <div key={label}><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>)}</div>
        <div className="results-actions">
          <button type="button" className="gold-button compact" onClick={onRematch}><RotateCcw size={18} /> Реванш</button>
          <button type="button" className="secondary-button" onClick={onMenu}><Home size={18} /> Вернуться в меню</button>
        </div>
        <small className="rematch-note">Реванш начнётся, когда оба игрока подтвердят готовность.</small>
      </section>
    </main>
  );
}
