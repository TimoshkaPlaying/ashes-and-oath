import { BUILDING_CONFIG, MARKET_RETURN_RATIO, MARKET_VALUES } from '@ashes/shared';
import { ArrowRightLeft, Castle, DoorClosed, DoorOpen, FlaskConical, Hammer, Landmark, LockKeyhole, Plus, Shield, Sparkles, Swords, TrendingUp, Users } from 'lucide-react';
import { useState } from 'react';
import { BUILDINGS, RESEARCH, RESOURCE_LABELS, UNITS, type Cost } from '../data/gameData';
import type { BuildingType, GameView, ResourceKey, UnitType } from '../types/domain';

export type DockTab = 'build' | 'train' | 'research' | 'squads' | 'realm';

const TABS: Array<{ id: DockTab; label: string; icon: typeof Hammer; hotkey: string }> = [
  { id: 'build', label: 'Стройки', icon: Hammer, hotkey: 'B' },
  { id: 'train', label: 'Войска', icon: Shield, hotkey: 'T' },
  { id: 'research', label: 'Улучшения', icon: FlaskConical, hotkey: 'R' },
  { id: 'squads', label: 'Отряды', icon: Swords, hotkey: 'G' },
  { id: 'realm', label: 'Королевство', icon: Landmark, hotkey: 'E' },
];

const TRADE_RESOURCES: ResourceKey[] = ['wood', 'stone', 'gold', 'iron', 'food'];
const RESOURCE_ICONS: Record<ResourceKey, string> = { wood: '🌲', stone: '⛰', gold: '●', iron: '◆', food: '🌾' };

function costEntries(cost: Cost) {
  return Object.entries(cost).filter((entry): entry is [keyof Cost, number] => typeof entry[1] === 'number');
}

function canAfford(game: GameView, cost: Cost, multiplier = 1) {
  return costEntries(cost).every(([key, amount]) => key === 'population'
    ? game.self.population >= amount * multiplier
    : game.resources[key as ResourceKey].amount >= amount * multiplier);
}

function CostLine({ cost, game, multiplier = 1 }: { cost: Cost; game: GameView; multiplier?: number }) {
  const icons: Record<keyof Cost, string> = { wood: '🌲', stone: '⛰', gold: '●', iron: '◆', food: '🌾', population: '♟' };
  return <div className="cost-line">{costEntries(cost).map(([key, amount]) => {
    const enough = key === 'population' ? game.self.population >= amount * multiplier : game.resources[key as ResourceKey].amount >= amount * multiplier;
    return <span key={key} className={enough ? '' : 'missing'} title={key === 'population' ? 'Население' : RESOURCE_LABELS[key as ResourceKey]}>{icons[key]} {amount * multiplier}</span>;
  })}</div>;
}

const TRAINING_BUILDING: Record<UnitType, BuildingType> = {
  infantry: 'barracks', archer: 'archeryRange', cavalry: 'stable', catapult: 'siegeWorkshop',
};

export function CommandDock({ game, tab, onTab, onBuild, onTrain, onResearch, onUpgradeTownHall, onOpenComposer, onUpgradeBuilding, onTrade, onToggleGate }: {
  game: GameView;
  tab: DockTab;
  onTab: (tab: DockTab) => void;
  onBuild: (type: BuildingType) => void;
  onTrain: (buildingId: string, unit: UnitType, count: number) => void;
  onResearch: (id: string) => void;
  onUpgradeTownHall: (buildingId: string) => void;
  onOpenComposer: () => void;
  onUpgradeBuilding: (buildingId: string) => void;
  onTrade: (sell: ResourceKey, buy: ResourceKey, amount: number) => void;
  onToggleGate: (buildingId: string, open: boolean) => void;
}) {
  const [trainingCounts, setTrainingCounts] = useState<Record<UnitType, number>>({ infantry: 1, archer: 1, cavalry: 1, catapult: 1 });
  const [marketSell, setMarketSell] = useState<ResourceKey>('wood');
  const [marketBuy, setMarketBuy] = useState<ResourceKey>('gold');
  const [marketAmount, setMarketAmount] = useState(25);
  const ownBuildings = game.buildings.filter((building) => building.ownerId === game.selfId && building.state === 'active');
  const townHall = ownBuildings.find((building) => building.type === 'townHall');
  const ownSquads = game.squads.filter((squad) => squad.ownerId === game.selfId && squad.status !== 'destroyed');
  const market = ownBuildings.find((building) => building.type === 'market');
  const gates = ownBuildings.filter((building) => building.type === 'gate');
  const manageableBuildings = ownBuildings.filter((building) => building.type !== 'townHall');
  const estimatedTrade = marketSell === marketBuy ? 0 : Math.floor(
    (marketAmount * MARKET_VALUES[marketSell] * MARKET_RETURN_RATIO * (1 + ((market?.level ?? 1) - 1) * 0.03)) / MARKET_VALUES[marketBuy],
  );

  return (
    <section className="command-dock hud-panel">
      <nav className="dock-tabs">
        {TABS.map(({ id, label, icon: Icon, hotkey }) => <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => onTab(id)}><Icon size={16} /><span>{label}</span><kbd>{hotkey}</kbd></button>)}
      </nav>

      <div className="dock-content">
        {tab === 'build' ? <>
          <div className="dock-context-card">
            <Castle size={34} />
            <div><span>Ратуша</span><strong>Уровень {game.self.townHallLevel}</strong><small>Открывает новые здания и войска</small></div>
            <button type="button" disabled={!townHall || game.self.townHallLevel >= 4} onClick={() => townHall && onUpgradeTownHall(townHall.id)}><Sparkles size={15} /> {game.self.townHallLevel >= 4 ? 'Макс. уровень' : 'Улучшить'}</button>
          </div>
          <div className="card-rail building-rail">
            {BUILDINGS.map((building) => {
              const locked = game.self.townHallLevel < building.townHall;
              const affordable = canAfford(game, building.cost);
              return <button type="button" key={building.type} className={`command-card ${locked ? 'locked' : ''}`} disabled={locked || !affordable} onClick={() => onBuild(building.type)} title={locked ? `Нужна ратуша ${building.townHall}-го уровня` : building.description}>
                {locked ? <LockKeyhole className="lock-icon" size={16} /> : null}
                <span className="command-art">{building.icon}</span><strong>{building.label}</strong><small>{building.description}</small>
                <CostLine cost={building.cost} game={game} />
                <em>{locked ? `Ратуша ${building.townHall}` : `${building.seconds}с`}</em>
              </button>;
            })}
          </div>
        </> : null}

        {tab === 'train' ? <div className="card-rail unit-rail">
          {UNITS.map((unit) => {
            const count = trainingCounts[unit.type];
            const building = ownBuildings.find((candidate) => candidate.type === TRAINING_BUILDING[unit.type]);
            const locked = game.self.townHallLevel < unit.townHall || !building;
            const affordable = canAfford(game, unit.cost, count);
            return <article className={`command-card training-card ${locked ? 'locked' : ''}`} key={unit.type}>
              {locked ? <LockKeyhole className="lock-icon" size={16} /> : null}
              <span className="command-art">{unit.icon}</span><strong>{unit.label}</strong><small>{locked ? `Нужно: ${unit.building}` : unit.description}</small>
              <div className="count-picker">{[1, 5, 10].map((value) => <button type="button" key={value} className={count === value ? 'active' : ''} onClick={() => setTrainingCounts((current) => ({ ...current, [unit.type]: value }))}>×{value}</button>)}</div>
              <CostLine cost={unit.cost} game={game} multiplier={count} />
              <button type="button" className="card-action" disabled={locked || !affordable} onClick={() => building && onTrain(building.id, unit.type, count)}><Plus size={14} /> В очередь · {unit.seconds * count}с</button>
            </article>;
          })}
        </div> : null}

        {tab === 'research' ? <div className="card-rail research-rail">
          {RESEARCH.map((research) => {
            const locked = game.self.townHallLevel < research.townHall;
            return <button type="button" key={research.id} className={`command-card ${locked ? 'locked' : ''}`} disabled={locked || !canAfford(game, research.cost)} onClick={() => onResearch(research.id)}>
              {locked ? <LockKeyhole className="lock-icon" size={16} /> : null}
              <span className="command-art">{research.icon}</span><strong>{research.label}</strong><small>{research.description}</small>
              <div className="research-levels"><i className="filled" /><i /><i /></div>
              <CostLine cost={research.cost} game={game} /><em>{locked ? `Ратуша ${research.townHall}` : `${research.seconds}с`}</em>
            </button>;
          })}
        </div> : null}

        {tab === 'squads' ? <div className="squad-dock-content">
          <div className="reserve-army">
            <div><Users size={22} /><span>Гарнизон</span><strong>{Object.values(game.reserveUnits).reduce((sum, count) => sum + count, 0)} бойцов</strong></div>
            <ul>
              <li>🛡 Пехота <b>{game.reserveUnits.infantry}</b></li><li>🏹 Лучники <b>{game.reserveUnits.archer}</b></li>
              <li>♞ Кавалерия <b>{game.reserveUnits.cavalry}</b></li><li>☄ Катапульты <b>{game.reserveUnits.catapult}</b></li>
            </ul>
          </div>
          <div className="squad-capacity"><span>Отряды</span><strong>{ownSquads.length} / 4</strong><div>{[0, 1, 2, 3].map((index) => <i key={index} className={index < ownSquads.length ? 'filled' : ''} />)}</div></div>
          <button type="button" className="gold-button compact compose-button" disabled={ownSquads.length >= 4 || Object.values(game.reserveUnits).every((value) => value === 0)} onClick={onOpenComposer}><Swords size={18} /> Сформировать новый отряд</button>
          <p className="squad-hint">Смешанный состав универсален. Выберите построение и поведение перед выходом на арену.</p>
        </div> : null}

        {tab === 'realm' ? <div className="realm-dock-content">
          <section className="market-console">
            <header><ArrowRightLeft size={17} /><div><strong>Королевский рынок</strong><small>{market ? `Уровень ${market.level}` : 'Сначала постройте рынок'}</small></div></header>
            <div className="trade-controls">
              <label><span>Продать</span><select value={marketSell} onChange={(event) => setMarketSell(event.target.value as ResourceKey)}>{TRADE_RESOURCES.map((resource) => <option key={resource} value={resource}>{RESOURCE_ICONS[resource]} {RESOURCE_LABELS[resource]}</option>)}</select></label>
              <ArrowRightLeft size={16} />
              <label><span>Получить</span><select value={marketBuy} onChange={(event) => setMarketBuy(event.target.value as ResourceKey)}>{TRADE_RESOURCES.map((resource) => <option key={resource} value={resource}>{RESOURCE_ICONS[resource]} {RESOURCE_LABELS[resource]}</option>)}</select></label>
            </div>
            <div className="trade-amounts">{[10, 25, 50, 100].map((amount) => <button type="button" key={amount} className={marketAmount === amount ? 'active' : ''} onClick={() => setMarketAmount(amount)}>{amount}</button>)}</div>
            <button type="button" className="card-action trade-submit" disabled={!market || marketSell === marketBuy || estimatedTrade < 1 || game.resources[marketSell].amount < marketAmount} onClick={() => onTrade(marketSell, marketBuy, marketAmount)}>
              Обменять {marketAmount} {RESOURCE_ICONS[marketSell]} → {estimatedTrade} {RESOURCE_ICONS[marketBuy]}
            </button>
          </section>

          <section className="building-manager">
            <header><TrendingUp size={17} /><div><strong>Владения</strong><small>Улучшения меняют реальные характеристики</small></div></header>
            <div className="building-manager-list">
              {manageableBuildings.length ? manageableBuildings.map((building) => {
                const definition = BUILDINGS.find((item) => item.type === building.type);
                const maxLevel = BUILDING_CONFIG[building.type].levels.length;
                const canUpgrade = building.level < maxLevel && building.state === 'active';
                return <article key={building.id}>
                  <span>{definition?.icon ?? '◆'}</span><div><strong>{definition?.label ?? building.type}</strong><small>Ур. {building.level}/{maxLevel} · {Math.round(building.hp)}/{Math.round(building.maxHp)} HP</small></div>
                  <button type="button" disabled={!canUpgrade} onClick={() => onUpgradeBuilding(building.id)} title={canUpgrade ? 'Улучшить здание' : 'Максимальный уровень или здание занято'}>{canUpgrade ? <Sparkles size={14} /> : 'MAX'}</button>
                </article>;
              }) : <p>Постройте первое здание, чтобы управлять владениями.</p>}
            </div>
          </section>

          <section className="gate-console">
            <header>{gates.some((gate) => gate.gateOpen) ? <DoorOpen size={18} /> : <DoorClosed size={18} />}<div><strong>Ворота</strong><small>Закрытые ворота задерживают штурм</small></div></header>
            {gates.length ? gates.map((gate) => <button type="button" key={gate.id} className={`gate-toggle ${gate.gateOpen ? 'open' : 'closed'}`} onClick={() => onToggleGate(gate.id, !gate.gateOpen)}>{gate.gateOpen ? <><DoorOpen size={16} /> Закрыть ворота</> : <><DoorClosed size={16} /> Открыть ворота</>}</button>) : <small>Ворота ещё не построены.</small>}
          </section>
        </div> : null}
      </div>
    </section>
  );
}
