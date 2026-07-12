import { BookOpen, Castle, DoorOpen, LogIn, Settings, Shield, Swords } from 'lucide-react';
import { useState } from 'react';
import { audioDirector } from '../audio/AudioDirector';
import type { ConnectionState } from '../types/domain';
import { ConnectionBadge, OrnateCorners } from './Common';

interface MenuScreenProps {
  connection: ConnectionState;
  ping: number | null;
  onCreate: (displayName: string) => void;
  onJoin: (code: string, displayName: string) => void;
  onSettings: () => void;
  onHelp: () => void;
}

const EMBERS = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 97}%`,
  delay: `${(index * 0.47) % 5}s`,
  duration: `${5 + (index % 6)}s`,
}));

export function MenuScreen({ connection, ping, onCreate, onJoin, onSettings, onHelp }: MenuScreenProps) {
  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('ashes.display-name.v1') ?? 'Полководец');
  const serverReady = connection === 'connected';

  const create = () => {
    audioDirector.play('confirm');
    onCreate(displayName);
  };
  const join = () => {
    audioDirector.play('confirm');
    onJoin(roomCode, displayName);
  };

  return (
    <main className="menu-screen">
      <div className="menu-backdrop" aria-hidden="true" />
      <div className="menu-vignette" aria-hidden="true" />
      <div className="embers" aria-hidden="true">
        {EMBERS.map((ember) => <i key={ember.id} style={{ left: ember.left, animationDelay: ember.delay, animationDuration: ember.duration }} />)}
      </div>

      <section className="brand-lockup" aria-label="Пепел и Клятва">
        <div className="brand-line"><span>ПЕПЕЛ</span></div>
        <div className="brand-and"><i />И<i /></div>
        <div className="brand-line"><span>КЛЯТВА</span></div>
        <p>Две короны. Одна клятва. Один победитель.</p>
      </section>

      <section className="menu-card iron-panel">
        <OrnateCorners />
        <div className="menu-crest" aria-hidden="true"><Shield /><Swords /></div>
        <label className="field-label menu-name-field">
          <span>Имя полководца</span>
          <input value={displayName} maxLength={24} onChange={(event) => setDisplayName(event.target.value)} placeholder="Полководец" />
        </label>

        <button type="button" className="gold-button menu-primary" onClick={create} disabled={!serverReady} title={serverReady ? 'Создать комнату' : 'Дождитесь соединения с сервером'}>
          <Castle size={27} /><span>Создать комнату</span>
        </button>
        <button type="button" className="stone-button menu-primary" onClick={() => document.querySelector<HTMLInputElement>('#room-code-input')?.focus()}>
          <DoorOpen size={27} /><span>Подключиться</span>
        </button>

        <label className="field-label room-code-field">
          <span>Код комнаты</span>
          <div className="input-with-button">
            <input
              id="room-code-input"
              value={roomCode}
              maxLength={6}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(event) => event.key === 'Enter' && join()}
              placeholder="Введите код комнаты"
              autoComplete="off"
            />
            <button type="button" onClick={join} disabled={!serverReady} aria-label="Войти в комнату"><LogIn size={20} /></button>
          </div>
        </label>

        <div className="menu-divider"><i /><span>◆</span><i /></div>
        <div className="menu-secondary-actions">
          <button type="button" className="secondary-button" onClick={() => { audioDirector.play('click'); onHelp(); }}><BookOpen size={20} /> Как играть</button>
          <button type="button" className="secondary-button" onClick={() => { audioDirector.play('click'); onSettings(); }}><Settings size={20} /> Настройки</button>
        </div>
      </section>

      <footer className="menu-status iron-panel">
        <ConnectionBadge connection={connection} ping={ping} />
        <i className="status-divider" />
        <span>v1.0.0</span>
      </footer>
    </main>
  );
}
