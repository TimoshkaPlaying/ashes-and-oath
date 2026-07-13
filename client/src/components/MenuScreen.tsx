import { BookOpen, Castle, DoorOpen, Globe2, LockKeyhole, LogIn, Settings, Shield, Swords } from 'lucide-react';
import { useState } from 'react';
import { audioDirector } from '../audio/AudioDirector';
import type { ConnectionState, PublicRoomView, RoomCreationOptions } from '../types/domain';
import { ConnectionBadge, OrnateCorners } from './Common';
import { RoomBrowser } from './RoomBrowser';

interface MenuScreenProps {
  connection: ConnectionState;
  ping: number | null;
  rooms: PublicRoomView[];
  roomActionPending: boolean;
  onCreate: (displayName: string, options: RoomCreationOptions) => void;
  onJoin: (code: string, displayName: string, password?: string) => void;
  onRefreshRooms: () => void;
  onSettings: () => void;
  onHelp: () => void;
}

const EMBERS = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 97}%`,
  delay: `${(index * 0.47) % 5}s`,
  duration: `${5 + (index % 6)}s`,
}));

export function MenuScreen({ connection, ping, rooms, roomActionPending, onCreate, onJoin, onRefreshRooms, onSettings, onHelp }: MenuScreenProps) {
  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('ashes.display-name.v1') ?? 'Полководец');
  const [roomName, setRoomName] = useState('Новая клятва');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [codeError, setCodeError] = useState('');
  const serverReady = connection === 'connected';

  const create = () => {
    const normalizedRoomName = roomName.trim();
    if (normalizedRoomName.length < 2 || roomActionPending) return;
    audioDirector.play('confirm');
    onCreate(displayName, {
      roomName: normalizedRoomName,
      visibility,
      maxPlayers: 2,
      ...(password.trim() ? { password: password.trim() } : {}),
    });
  };

  const join = (code = roomCode, protectedPassword = joinPassword) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setCodeError('Введите код комнаты');
      return;
    }
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(normalized)) {
      setCodeError('Код должен содержать 5 допустимых символов');
      return;
    }
    setCodeError('');
    audioDirector.play('confirm');
    onJoin(normalized, displayName, protectedPassword);
  };

  return (
    <main className="menu-screen">
      <div className="menu-backdrop" aria-hidden="true" />
      <div className="menu-vignette" aria-hidden="true" />
      <div className="embers" aria-hidden="true">
        {EMBERS.map((ember) => <i key={ember.id} style={{ left: ember.left, animationDelay: ember.delay, animationDuration: ember.duration }} />)}
      </div>

      <div className="menu-scroll-content">
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

          <form className="room-create-form" onSubmit={(event) => { event.preventDefault(); create(); }}>
            <label className="field-label"><span>Название комнаты</span><input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={40} /></label>
            <div className="room-create-options">
              <label><span>Доступ</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}><option value="public">Публичная</option><option value="private">Приватная</option></select></label>
              <label><span>Игроков</span><select value="2" disabled><option value="2">2</option></select></label>
            </div>
            <label className="field-label"><span>Пароль — необязательно</span><div className="input-icon-wrap"><LockKeyhole size={16} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={4} maxLength={48} placeholder="Минимум 4 символа" /></div></label>
            <button type="submit" className="gold-button menu-primary" disabled={!serverReady || roomActionPending || roomName.trim().length < 2} title={serverReady ? 'Создать комнату' : 'Дождитесь соединения с сервером'}>
              <Castle size={25} /><span>{roomActionPending ? 'Подключение…' : 'Создать комнату'}</span>
            </button>
          </form>

          <button type="button" className="stone-button menu-primary" onClick={() => document.querySelector<HTMLInputElement>('#room-code-input')?.focus()}>
            <DoorOpen size={25} /><span>Подключиться по коду</span>
          </button>

          <form className="room-code-form" onSubmit={(event) => { event.preventDefault(); join(); }}>
            <label className={`field-label room-code-field ${codeError ? 'field-error' : ''}`}>
              <span>Код комнаты</span>
              <div className="input-with-button">
                <input id="room-code-input" value={roomCode} maxLength={5} onChange={(event) => { setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setCodeError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); join(event.currentTarget.value, joinPassword); } }} placeholder="ABCDE" autoComplete="off" inputMode="text" />
                <button type="submit" disabled={!serverReady || roomActionPending} aria-label="Войти в комнату"><LogIn size={20} /></button>
              </div>
              {codeError ? <small className="field-error-message">{codeError}</small> : null}
            </label>
            <label className="field-label compact-password"><span>Пароль — если требуется</span><input type="password" value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} maxLength={48} /></label>
          </form>

          <div className="menu-divider"><i /><span>◆</span><i /></div>
          <div className="menu-secondary-actions">
            <button type="button" className="secondary-button" onClick={() => { audioDirector.play('click'); onHelp(); }}><BookOpen size={20} /> Как играть</button>
            <button type="button" className="secondary-button" onClick={() => { audioDirector.play('click'); onSettings(); }}><Settings size={20} /> Настройки</button>
          </div>
        </section>

        <RoomBrowser rooms={rooms} pending={roomActionPending} onRefresh={onRefreshRooms} onJoin={(code, roomPassword) => join(code, roomPassword)} />
      </div>

      <footer className="menu-status iron-panel">
        <ConnectionBadge connection={connection} ping={ping} />
        <i className="status-divider" />
        <span><Globe2 size={14} /> v1.2.0</span>
      </footer>
    </main>
  );
}

