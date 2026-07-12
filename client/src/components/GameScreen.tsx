import type { GameCommand, ResearchType } from '@ashes/shared';
import { BookOpen, Hammer, List, Pause, Play, Settings, Swords } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioDirector } from '../audio/AudioDirector';
import { useFps } from '../hooks/useFps';
import type { PendingGameCommand } from '../network/useGameClient';
import { PhaserArena, type ArenaHandle } from '../game/PhaserArena';
import type { ArenaCommand } from '../game/BattleScene';
import type { ConnectionState, GameSettings, GameView } from '../types/domain';
import { CommandDock, type DockTab } from './CommandDock';
import { EventLog, MiniMap, OpponentPanel, QueuePanel, SquadRail, type SquadAction } from './SideHud';
import { SquadComposer } from './SquadComposer';
import { TopHud, TruceBanner } from './TopHud';

interface GameScreenProps {
  game: GameView;
  connection: ConnectionState;
  ping: number | null;
  settings: GameSettings;
  onSettings: () => void;
  onReturnMenu: () => void;
  onCommand: (command: PendingGameCommand) => void;
  onToast: (toast: { tone: 'neutral' | 'success' | 'warning' | 'danger'; title: string; detail?: string }) => void;
}

export function GameScreen({ game, connection, ping, settings, onSettings, onReturnMenu, onCommand, onToast }: GameScreenProps) {
  const arenaRef = useRef<ArenaHandle>(null);
  const previousPhaseRef = useRef(game.phase);
  const lastTickRef = useRef(-1);
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [dockTab, setDockTab] = useState<DockTab>('build');
  const [eventsCollapsed, setEventsCollapsed] = useState(false);
  const [squadsCollapsed, setSquadsCollapsed] = useState(false);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [revealMessage, setRevealMessage] = useState(false);
  const [now, setNow] = useState(Date.now());
  const fps = useFps(settings.showFps);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const truceSeconds = Math.max(0, Math.ceil((game.truceEndsAt - now) / 1000));
  const lastBattleSeconds = Math.max(0, Math.ceil(((game.lastBattleEndsAt ?? game.matchEndsAt) - now) / 1000));

  useEffect(() => {
    if (game.phase === 'truce' && truceSeconds <= 5 && truceSeconds > 0 && lastTickRef.current !== truceSeconds) {
      lastTickRef.current = truceSeconds;
      audioDirector.play('tick');
    }
  }, [game.phase, truceSeconds]);

  useEffect(() => {
    if (previousPhaseRef.current === 'truce' && game.phase !== 'truce') {
      audioDirector.play('horn');
      setRevealMessage(true);
      const timer = window.setTimeout(() => setRevealMessage(false), 2_800);
      previousPhaseRef.current = game.phase;
      return () => window.clearTimeout(timer);
    }
    previousPhaseRef.current = game.phase;
    return undefined;
  }, [game.phase]);

  const selectSquad = useCallback((id: string) => {
    setSelectedSquadId(id);
    arenaRef.current?.selectSquad(id);
    audioDirector.play('click');
  }, []);

  const handleArenaCommand = useCallback((command: ArenaCommand) => {
    if (command.kind === 'targetSquad') {
      if (game.phase === 'truce') {
        audioDirector.play('error');
        onToast({ tone: 'warning', title: 'Перемирие ещё действует', detail: 'Вражеские цели станут доступны после сигнала рога.' });
        return;
      }
      audioDirector.play('attack');
      onCommand({ type: 'squad:target', payload: { squadId: command.squadId, target: { kind: 'enemySquad', squadId: command.targetSquadId } } });
      return;
    }
    audioDirector.play('click');
    onCommand({ type: 'squad:move', payload: { squadId: command.squadId, destination: { x: Math.round(command.x), y: Math.round(command.y) } } });
  }, [game.phase, onCommand, onToast]);

  const handleSquadAction = useCallback((id: string, action: SquadAction) => {
    audioDirector.play(action === 'attack' ? 'attack' : 'click');
    if (action === 'stop') onCommand({ type: 'squad:stop', payload: { squadId: id } });
    if (action === 'retreat') onCommand({ type: 'squad:retreat', payload: { squadId: id } });
    if (action === 'defend') onCommand({ type: 'squad:target', payload: { squadId: id, target: { kind: 'defendBase' } } });
    if (action === 'hospital') onCommand({ type: 'squad:hospitalize', payload: { squadId: id } });
    if (action === 'attack' && game.phase !== 'truce') onCommand({ type: 'squad:target', payload: { squadId: id, target: { kind: 'enemyBase' } } });
  }, [game.phase, onCommand]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key >= '1' && event.key <= '4') {
        const squad = game.squads.filter((item) => item.ownerId === game.selfId && item.status !== 'destroyed')[Number(event.key) - 1];
        if (squad) selectSquad(squad.id);
      }
      if (event.key.toLowerCase() === 'b') setDockTab('build');
      if (event.key.toLowerCase() === 't') setDockTab('train');
      if (event.key.toLowerCase() === 'r') setDockTab('research');
      if (event.key.toLowerCase() === 'g') setDockTab('squads');
      if (event.key.toLowerCase() === 'e') setDockTab('realm');
      if (event.code === 'Space') { event.preventDefault(); arenaRef.current?.centerOnBase(); }
      if (event.key === 'Escape') setPaused((current) => !current);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [game.selfId, game.squads, selectSquad]);

  const send = <TCommand extends GameCommand>(command: Omit<TCommand, 'id' | 'seq'>) => onCommand(command as PendingGameCommand);
  const ownSquads = game.squads.filter((squad) => squad.ownerId === game.selfId && squad.status !== 'destroyed');

  return (
    <main className={`game-screen quality-${settings.quality}`}>
      <PhaserArena ref={arenaRef} game={game} quality={settings.quality} onSelectSquad={selectSquad} onCommand={handleArenaCommand} />
      <div className="canvas-vignette" aria-hidden="true" />
      <TopHud game={game} connection={connection} ping={ping} onSettings={onSettings} onMenu={() => setPaused(true)} />
      <TruceBanner phase={game.phase} seconds={game.phase === 'lastBattle' ? lastBattleSeconds : truceSeconds} />

      <EventLog events={game.events} collapsed={eventsCollapsed} onToggle={() => setEventsCollapsed((current) => !current)} />
      <div className="right-hud-stack">
        <OpponentPanel game={game} />
        <SquadRail game={game} selectedId={selectedSquadId} collapsed={squadsCollapsed} onToggle={() => setSquadsCollapsed((current) => !current)} onSelect={selectSquad} onAction={handleSquadAction} onCreate={() => setComposerOpen(true)} />
      </div>
      <div className="bottom-right-hud">
        <QueuePanel queues={game.queues} collapsed={queueCollapsed} onToggle={() => setQueueCollapsed((current) => !current)} onCancel={(queueId) => { audioDirector.play('click'); onCommand({ type: 'training:cancel', payload: { queueId } }); }} />
        <MiniMap game={game} onFocus={(x, y) => arenaRef.current?.focusAt(x, y)} onHome={() => arenaRef.current?.centerOnBase()} />
      </div>
      <CommandDock
        game={game}
        tab={dockTab}
        onTab={(tab) => { audioDirector.play('click'); setDockTab(tab); }}
        onBuild={(buildingType) => { audioDirector.play('build'); send({ type: 'building:construct', payload: { buildingType } }); }}
        onTrain={(buildingId, unitType, count) => { audioDirector.play('train'); send({ type: 'training:queue', payload: { buildingId, unitType, count } }); }}
        onResearch={(researchType) => { audioDirector.play('confirm'); send({ type: 'research:start', payload: { researchType: researchType as ResearchType } }); }}
        onUpgradeTownHall={(buildingId) => { audioDirector.play('build'); send({ type: 'building:upgrade', payload: { buildingId } }); }}
        onOpenComposer={() => setComposerOpen(true)}
        onUpgradeBuilding={(buildingId) => { audioDirector.play('build'); send({ type: 'building:upgrade', payload: { buildingId } }); }}
        onTrade={(sell, buy, amount) => { audioDirector.play('confirm'); send({ type: 'market:trade', payload: { sell, buy, amount } }); }}
        onToggleGate={(buildingId, open) => { audioDirector.play('click'); send({ type: 'gate:set', payload: { buildingId, open } }); }}
      />

      <nav className="mobile-hud-nav" aria-label="Игровые панели">
        <button type="button" onClick={() => setEventsCollapsed((current) => !current)}><List size={17} /><span>Журнал</span></button>
        <button type="button" onClick={() => setSquadsCollapsed((current) => !current)}><Swords size={17} /><span>Отряды</span></button>
        <button type="button" onClick={() => setQueueCollapsed((current) => !current)}><BookOpen size={17} /><span>Очереди</span></button>
        <button type="button" onClick={() => setDockTab((current) => current === 'realm' ? 'build' : 'realm')}><Hammer size={17} /><span>Королевство</span></button>
      </nav>

      {settings.showFps ? <div className="fps-counter">FPS {fps}</div> : null}
      {revealMessage ? <div className="truce-ended"><i /><span>⚔</span><strong>Перемирие окончено</strong><small>Общая арена открыта</small><i /></div> : null}

      {paused ? <div className="modal-backdrop pause-backdrop">
        <section className="modal-card iron-panel pause-card">
          <Pause size={34} /><h2>Сражение продолжается</h2><p>На сервере время не останавливается.</p>
          <button type="button" className="gold-button compact" onClick={() => setPaused(false)}><Play size={18} /> Вернуться в бой</button>
          <button type="button" className="secondary-button" onClick={onSettings}><Settings size={18} /> Настройки</button>
          <button type="button" className="leave-button" onClick={onReturnMenu}>Покинуть матч</button>
        </section>
      </div> : null}

      <SquadComposer open={composerOpen} reserve={game.reserveUnits} nextNumber={ownSquads.length + 1} onClose={() => setComposerOpen(false)} onSubmit={(value) => { audioDirector.play('confirm'); onCommand({ type: 'squad:create', payload: value }); }} />
    </main>
  );
}
