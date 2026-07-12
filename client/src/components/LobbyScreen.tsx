import { Check, Copy, Crown, DoorOpen, Hourglass, LogOut, Shield, Swords, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { audioDirector } from '../audio/AudioDirector';
import type { ConnectionState, LobbyCustomization, LobbyView, PlayerView } from '../types/domain';
import { ConnectionBadge, OrnateCorners } from './Common';

interface LobbyScreenProps {
  lobby: LobbyView;
  connection: ConnectionState;
  ping: number | null;
  onUpdate: (customization: Partial<LobbyCustomization>) => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
}

const COLORS = ['#315f9b', '#9b3d36', '#49683c', '#684186', '#a47722', '#267080'];
const FLAGS = [
  { id: 'lion', glyph: '♞', label: 'Лев' },
  { id: 'eagle', glyph: '🦅', label: 'Орёл' },
  { id: 'stag', glyph: '♜', label: 'Олень' },
  { id: 'cross', glyph: '✥', label: 'Крест' },
  { id: 'dragon', glyph: '♨', label: 'Дракон' },
  { id: 'sun', glyph: '☀', label: 'Солнце' },
];
const CRESTS = [
  { id: 'crown', glyph: '♛', label: 'Корона' },
  { id: 'sword', glyph: '⚔', label: 'Мечи' },
  { id: 'raven', glyph: '◆', label: 'Ворон' },
  { id: 'tower', glyph: '♜', label: 'Башня' },
];

function PlayerBanner({ player, waiting }: { player?: PlayerView; waiting?: boolean }) {
  const color = player?.color ?? '#7c302d';
  return (
    <div className={`lobby-banner ${waiting ? 'waiting' : ''}`} style={{ '--banner-color': color } as React.CSSProperties}>
      <div className="banner-pole" />
      <div className="banner-cloth"><span>{waiting ? '⌛' : FLAGS.find((flag) => flag.id === player?.flag)?.glyph ?? '♞'}</span></div>
    </div>
  );
}

export function LobbyScreen({ lobby, connection, ping, onUpdate, onReady, onLeave }: LobbyScreenProps) {
  const self = lobby.players.find((player) => player.id === lobby.selfId) ?? lobby.players[0];
  const opponent = lobby.players.find((player) => player.id !== lobby.selfId);
  const [copied, setCopied] = useState(false);
  const [customization, setCustomization] = useState<LobbyCustomization>(() => ({
    kingdomName: self?.kingdomName || 'Северный Предел',
    color: self?.color || COLORS[0],
    flag: self?.flag || FLAGS[0].id,
    crest: self?.crest || CRESTS[0].id,
  }));

  useEffect(() => {
    if (!self) return;
    setCustomization({
      kingdomName: self.kingdomName || 'Северный Предел',
      color: self.color || COLORS[0],
      flag: self.flag || FLAGS[0].id,
      crest: self.crest || CRESTS[0].id,
    });
  }, [self?.color, self?.crest, self?.flag, self?.kingdomName]);

  const update = <TKey extends keyof LobbyCustomization>(key: TKey, value: LobbyCustomization[TKey]) => {
    setCustomization((current) => ({ ...current, [key]: value }));
    onUpdate({ [key]: value });
    audioDirector.play('click');
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(lobby.roomCode);
    setCopied(true);
    audioDirector.play('confirm');
    window.setTimeout(() => setCopied(false), 1_800);
  };

  const ready = self?.ready ?? false;

  return (
    <main className="lobby-screen">
      <div className="menu-backdrop lobby-backdrop" aria-hidden="true" />
      <div className="menu-vignette" aria-hidden="true" />
      <header className="lobby-brand"><Shield size={30} /><div><span>ПЕПЕЛ</span><i>И</i><span>КЛЯТВА</span></div></header>

      <section className="lobby-shell iron-panel">
        <OrnateCorners />
        <div className="lobby-title"><Swords size={20} /><h1>Лобби</h1><Swords size={20} /></div>
        <div className="room-code-box">
          <span>Код комнаты</span>
          <strong>{lobby.roomCode}</strong>
          <button type="button" onClick={() => void copyCode()} aria-label="Скопировать код комнаты">
            {copied ? <Check size={20} /> : <Copy size={20} />}
          </button>
          {copied ? <small>Скопировано</small> : null}
        </div>

        <div className="lobby-players">
          <article className={`player-slot ${ready ? 'is-ready' : ''}`}>
            <div className="slot-number"><Crown size={16} />1</div>
            <PlayerBanner player={self} />
            <div className="player-editor">
              <div className="player-name-line"><span>Имя игрока</span><strong>{self?.name ?? 'Полководец'}</strong></div>
              <label className="lobby-field"><span>Название королевства</span><input maxLength={28} value={customization.kingdomName} onChange={(event) => update('kingdomName', event.target.value)} /></label>
              <div className="choice-label">Цвет фракции</div>
              <div className="swatch-row">
                {COLORS.map((color) => <button type="button" key={color} className={customization.color === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => update('color', color)} aria-label={`Выбрать цвет ${color}`} />)}
              </div>
              <div className="choice-label">Знамя</div>
              <div className="sigil-row">
                {FLAGS.map((flag) => <button type="button" key={flag.id} className={customization.flag === flag.id ? 'selected' : ''} onClick={() => update('flag', flag.id)} title={flag.label}>{flag.glyph}</button>)}
              </div>
              <div className="choice-label">Герб</div>
              <div className="sigil-row crest-row">
                {CRESTS.map((crest) => <button type="button" key={crest.id} className={customization.crest === crest.id ? 'selected' : ''} onClick={() => update('crest', crest.id)} title={crest.label}>{crest.glyph}</button>)}
              </div>
              <button type="button" className={`ready-button ${ready ? 'is-ready' : ''}`} onClick={() => { audioDirector.play(ready ? 'click' : 'confirm'); onReady(!ready); }}>
                {ready ? <><Check size={20} /> Готов — изменить выбор</> : <><Swords size={20} /> Готов к битве</>}
              </button>
            </div>
          </article>

          <article className={`player-slot opponent-slot ${opponent?.ready ? 'is-ready' : ''} ${!opponent ? 'is-empty' : ''}`}>
            <div className="slot-number">2</div>
            <PlayerBanner player={opponent} waiting={!opponent} />
            <div className="opponent-details">
              {opponent ? (
                <>
                  <span>Имя игрока</span><strong>{opponent.name}</strong>
                  <span>Название королевства</span><strong>{opponent.kingdomName}</strong>
                  <div className="opponent-color"><i style={{ backgroundColor: opponent.color }} /><span>{opponent.connected ? 'На связи' : 'Переподключается…'}</span></div>
                  <div className={`opponent-ready ${opponent.ready ? 'ready' : ''}`}>{opponent.ready ? <><Check size={18} /> Готов к битве</> : <><Hourglass size={18} /> Выбирает знамя</>}</div>
                </>
              ) : (
                <div className="waiting-copy"><Users size={28} /><strong>Ожидание соперника</strong><span>Передайте код комнаты второму игроку</span><i /></div>
              )}
            </div>
          </article>
        </div>

        <div className="lobby-footer">
          <ConnectionBadge connection={connection} ping={ping} />
          <div className="match-readiness">
            {ready && opponent?.ready ? <><Swords size={18} /> Обе клятвы принесены. Битва начинается…</> : <><Hourglass size={18} /> {opponent ? 'Ожидание готовности игроков' : 'Ожидание второго игрока'}</>}
          </div>
          <button type="button" className="leave-button" onClick={() => { audioDirector.play('click'); onLeave(); }}><LogOut size={18} /> Покинуть комнату</button>
        </div>
      </section>
      <div className="lobby-tip"><DoorOpen size={15} /> Комната рассчитана строго на двух полководцев</div>
    </main>
  );
}
