import { Minus, Plus, Shield, Swords, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BEHAVIORS, FORMATIONS, UNITS } from '../data/gameData';
import type { Behavior, Formation, UnitCounts, UnitType } from '../types/domain';
import { OrnateCorners } from './Common';

interface SquadComposerProps {
  open: boolean;
  reserve: UnitCounts;
  nextNumber: number;
  onClose: () => void;
  onSubmit: (value: { name: string; composition: UnitCounts; formation: Formation; behavior: Behavior }) => void;
}

export function SquadComposer({ open, reserve, nextNumber, onClose, onSubmit }: SquadComposerProps) {
  const [name, setName] = useState(`Отряд ${nextNumber}`);
  const [composition, setComposition] = useState<UnitCounts>({ infantry: 0, archer: 0, cavalry: 0, catapult: 0 });
  const [formation, setFormation] = useState<Formation>('line');
  const [behavior, setBehavior] = useState<Behavior>('nearestEnemy');

  useEffect(() => {
    if (!open) return;
    setName(`Отряд ${nextNumber}`);
    setComposition({ infantry: 0, archer: 0, cavalry: 0, catapult: 0 });
  }, [nextNumber, open]);

  if (!open) return null;
  const total = Object.values(composition).reduce((sum, value) => sum + value, 0);
  const population = composition.infantry + composition.archer + composition.cavalry * 2 + composition.catapult * 3;
  const power = composition.infantry * 18 + composition.archer * 21 + composition.cavalry * 38 + composition.catapult * 64;

  const changeCount = (type: UnitType, delta: number) => {
    setComposition((current) => ({ ...current, [type]: Math.max(0, Math.min(reserve[type], current[type] + delta)) }));
  };

  return (
    <div className="modal-backdrop composer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card iron-panel squad-composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <OrnateCorners />
        <header><div><Swords size={21} /><h2 id="composer-title">Формирование отряда</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></header>
        <div className="composer-grid">
          <div className="composer-units">
            <label className="lobby-field composer-name"><span>Название отряда</span><input maxLength={26} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <h3>Выберите бойцов из гарнизона</h3>
            {UNITS.map((unit) => <div className="unit-counter" key={unit.type}>
              <span>{unit.icon}</span><div><strong>{unit.label}</strong><small>В гарнизоне: {reserve[unit.type]}</small></div>
              <div className="counter-controls"><button type="button" onClick={() => changeCount(unit.type, -1)} disabled={composition[unit.type] === 0}><Minus size={14} /></button><b>{composition[unit.type]}</b><button type="button" onClick={() => changeCount(unit.type, 1)} disabled={composition[unit.type] >= reserve[unit.type]}><Plus size={14} /></button></div>
            </div>)}
          </div>
          <div className="composer-tactics">
            <h3><Shield size={17} /> Построение</h3>
            <div className="formation-list">{FORMATIONS.map((option) => <button type="button" key={option.value} className={formation === option.value ? 'selected' : ''} onClick={() => setFormation(option.value)}><i>{option.value === 'wedge' ? '⌃' : option.value === 'defensive' ? '▰' : option.value === 'protectSiege' ? '◈' : '•••'}</i><span><b>{option.label}</b><small>{option.description}</small></span></button>)}</div>
            <h3><Swords size={17} /> Поведение</h3>
            <select value={behavior} onChange={(event) => setBehavior(event.target.value as Behavior)}>{BEHAVIORS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
            <div className="composer-summary"><div><span>Бойцов</span><b>{total}</b></div><div><span>Население</span><b>{population}</b></div><div><span>Сила</span><b>{power}</b></div></div>
          </div>
        </div>
        <footer><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button type="button" className="gold-button compact" disabled={total === 0 || !name.trim()} onClick={() => { onSubmit({ name: name.trim(), composition, formation, behavior }); onClose(); }}><Swords size={17} /> Создать отряд</button></footer>
      </section>
    </div>
  );
}
