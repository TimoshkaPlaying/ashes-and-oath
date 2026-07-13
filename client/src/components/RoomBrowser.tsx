import { Clock3, LockKeyhole, RefreshCw, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PublicRoomView } from '../types/domain';

interface RoomBrowserProps {
  rooms: PublicRoomView[];
  pending: boolean;
  onJoin: (code: string, password?: string) => void;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<PublicRoomView['status'], string> = {
  waiting: 'Ожидание игроков',
  starting: 'Матч начинается',
  playing: 'Игра уже идёт',
  full: 'Комната заполнена',
  unavailable: 'Комната недоступна',
};

export function RoomBrowser({ rooms, pending, onJoin, onRefresh }: RoomBrowserProps) {
  const [query, setQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(true);
  const [sort, setSort] = useState<'newest' | 'players'>('newest');
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  const visibleRooms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return rooms
      .filter((room) => !freeOnly || room.joinable)
      .filter((room) => !normalized || room.name.toLocaleLowerCase().includes(normalized) || room.code.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => sort === 'players'
        ? right.playerCount - left.playerCount || right.createdAt - left.createdAt
        : right.createdAt - left.createdAt);
  }, [freeOnly, query, rooms, sort]);

  return (
    <section className="room-browser iron-panel" aria-labelledby="public-rooms-title">
      <header className="room-browser-header">
        <div><Users size={20} /><h2 id="public-rooms-title">Публичные комнаты</h2></div>
        <button type="button" className="icon-action" onClick={onRefresh} disabled={pending} aria-label="Обновить список комнат"><RefreshCw size={18} /></button>
      </header>
      <div className="room-browser-tools">
        <label className="room-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или код" /></label>
        <label className="compact-toggle"><input type="checkbox" checked={freeOnly} onChange={(event) => setFreeOnly(event.target.checked)} /> Только свободные</label>
        <label className="room-sort"><span>Сортировка</span><select value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'players')}><option value="newest">Сначала новые</option><option value="players">По игрокам</option></select></label>
      </div>

      <div className="room-list" aria-live="polite">
        {visibleRooms.length === 0 ? <div className="room-list-empty">Доступных комнат пока нет. Создайте первую или обновите список.</div> : visibleRooms.map((room) => (
          <article className={`room-row room-${room.status}`} key={room.code}>
            <div className="room-row-main"><strong title={room.name}>{room.name}</strong><code>{room.code}</code><span>Владелец: {room.ownerName}</span></div>
            <div className="room-row-meta">
              <span><Users size={14} /> {room.playerCount}/{room.maxPlayers}</span>
              <span><Clock3 size={14} /> {new Date(room.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="room-status">{STATUS_LABELS[room.status]}</span>
            </div>
            {room.passwordRequired ? (
              <label className="room-password"><LockKeyhole size={14} /><input type="password" value={passwords[room.code] ?? ''} onChange={(event) => setPasswords((current) => ({ ...current, [room.code]: event.target.value }))} placeholder="Пароль" maxLength={48} /></label>
            ) : <span className="room-open-label">Без пароля</span>}
            <button type="button" className="secondary-button room-join-button" disabled={!room.joinable || pending || (room.passwordRequired && !(passwords[room.code]?.trim()))} onClick={() => onJoin(room.code, passwords[room.code])}>Подключиться</button>
          </article>
        ))}
      </div>
    </section>
  );
}
