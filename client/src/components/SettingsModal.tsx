import { Gauge, RotateCcw, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-react';
import type { GameSettings, Quality } from '../types/domain';
import { OrnateCorners } from './Common';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  onChange: (patch: Partial<Omit<GameSettings, 'version'>>) => void;
  onReset: () => void;
  onClose: () => void;
}

const QUALITY_OPTIONS: Array<{ value: Quality; label: string; detail: string }> = [
  { value: 'low', label: 'Низкое', detail: 'Меньше частиц' },
  { value: 'medium', label: 'Среднее', detail: 'Баланс' },
  { value: 'high', label: 'Высокое', detail: 'Все эффекты' },
];

export function SettingsModal({ open, settings, onChange, onReset, onClose }: SettingsModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card iron-panel settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <OrnateCorners />
        <header>
          <div><SlidersHorizontal size={20} /><h2 id="settings-title">Настройки</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть настройки"><X size={19} /></button>
        </header>

        <div className="settings-section">
          <label className="slider-row">
            <span><Volume2 size={18} /><b>Музыка</b><em>{Math.round(settings.musicVolume * 100)}%</em></span>
            <input type="range" min="0" max="1" step="0.01" value={settings.musicVolume} onChange={(event) => onChange({ musicVolume: Number(event.target.value) })} />
          </label>
          <label className="slider-row">
            <span><Volume2 size={18} /><b>Эффекты</b><em>{Math.round(settings.effectsVolume * 100)}%</em></span>
            <input type="range" min="0" max="1" step="0.01" value={settings.effectsVolume} onChange={(event) => onChange({ effectsVolume: Number(event.target.value) })} />
          </label>
          <button type="button" className={`toggle-row ${settings.muted ? 'is-active' : ''}`} onClick={() => onChange({ muted: !settings.muted })}>
            {settings.muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
            <span><b>Полностью отключить звук</b><small>Музыка и все эффекты</small></span>
            <i className="switch"><span /></i>
          </button>
        </div>

        <div className="settings-section">
          <div className="section-label"><Gauge size={17} /> Качество изображения</div>
          <div className="quality-grid">
            {QUALITY_OPTIONS.map((option) => (
              <button type="button" key={option.value} className={settings.quality === option.value ? 'selected' : ''} onClick={() => onChange({ quality: option.value })}>
                <b>{option.label}</b><small>{option.detail}</small>
              </button>
            ))}
          </div>
          <button type="button" className={`toggle-row ${settings.showFps ? 'is-active' : ''}`} onClick={() => onChange({ showFps: !settings.showFps })}>
            <Gauge size={19} />
            <span><b>Показывать FPS</b><small>Счётчик частоты кадров</small></span>
            <i className="switch"><span /></i>
          </button>
        </div>

        <footer>
          <button type="button" className="secondary-button" onClick={onReset}><RotateCcw size={16} /> Сбросить</button>
          <button type="button" className="gold-button compact" onClick={onClose}>Применить</button>
        </footer>
      </section>
    </div>
  );
}
