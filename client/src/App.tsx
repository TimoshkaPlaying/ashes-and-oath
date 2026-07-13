import { useEffect, useState } from 'react';
import { audioDirector } from './audio/AudioDirector';
import { GameScreen } from './components/GameScreen';
import { HelpModal } from './components/HelpModal';
import { LoadingScreen, ReconnectOverlay, ToastStack } from './components/Common';
import { LobbyScreen } from './components/LobbyScreen';
import { MenuScreen } from './components/MenuScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { SettingsModal } from './components/SettingsModal';
import { useSettings } from './hooks/useSettings';
import { useGameClient } from './network/useGameClient';

const PRELOAD_ASSETS = ['/assets/battlefield.png', '/assets/units.png', '/assets/buildings.png'];

function useAssetPreloader() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let active = true;
    let loaded = 0;
    const started = performance.now();
    const finish = () => {
      loaded += 1;
      if (!active) return;
      setProgress(loaded / PRELOAD_ASSETS.length);
    };
    const images = PRELOAD_ASSETS.map((source) => {
      const image = new Image();
      image.onload = finish;
      image.onerror = finish;
      image.src = source;
      return image;
    });
    const minimumTimer = window.setTimeout(() => {
      if (active && loaded === PRELOAD_ASSETS.length && performance.now() - started > 450) setProgress(1);
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(minimumTimer);
      for (const image of images) { image.onload = null; image.onerror = null; }
    };
  }, []);
  return progress;
}

export default function App() {
  const client = useGameClient();
  const { settings, updateSettings, resetSettings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const progress = useAssetPreloader();

  useEffect(() => {
    audioDirector.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (client.state.screen !== 'results' || !client.state.game?.winnerId) return;
    audioDirector.play(client.state.game.winnerId === client.state.game.selfId ? 'victory' : 'defeat');
  }, [client.state.game?.selfId, client.state.game?.winnerId, client.state.screen]);

  useEffect(() => {
    const unlock = () => void audioDirector.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  if (progress < 1) return <LoadingScreen progress={progress} />;

  const { state } = client;
  let screen: React.ReactNode;
  if (state.screen === 'lobby' && state.lobby) {
    screen = <LobbyScreen lobby={state.lobby} connection={state.connection} ping={state.ping} onUpdate={client.updateLobby} onReady={client.setReady} onStart={client.startMatch} onKick={client.kickPlayer} onTransferOwner={client.transferOwner} onRoomSettings={client.updateRoomSettings} onLeave={client.leaveRoom} />;
  } else if (state.screen === 'game' && state.game) {
    screen = <GameScreen game={state.game} connection={state.connection} ping={state.ping} settings={settings} onSettings={() => setSettingsOpen(true)} onReturnMenu={client.showMenu} onCommand={client.sendCommand} onToast={client.addToast} />;
  } else if (state.screen === 'results' && state.game) {
    screen = <ResultsScreen game={state.game} onRematch={() => client.requestRematch(true)} onMenu={client.showMenu} />;
  } else {
    screen = <MenuScreen connection={state.connection} ping={state.ping} rooms={state.publicRooms} roomActionPending={state.roomActionPending} onCreate={client.createRoom} onJoin={client.joinRoom} onRefreshRooms={client.requestRoomList} onSettings={() => setSettingsOpen(true)} onHelp={() => setHelpOpen(true)} />;
  }

  return (
    <>
      {screen}
      <SettingsModal open={settingsOpen} settings={settings} onChange={updateSettings} onReset={resetSettings} onClose={() => setSettingsOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ToastStack toasts={state.toasts} onDismiss={client.removeToast} />
      {state.connection === 'reconnecting' && state.resumeSeconds !== null ? <ReconnectOverlay seconds={state.resumeSeconds} /> : null}
    </>
  );
}
