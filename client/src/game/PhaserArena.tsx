import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { GameView, Quality } from '../types/domain';
import { BattleScene, type ArenaCommand } from './BattleScene';

export interface ArenaHandle {
  selectSquad: (id: string | null) => void;
  focusAt: (x: number, y: number) => void;
  centerOnBase: () => void;
}

interface PhaserArenaProps {
  game: GameView;
  quality: Quality;
  onSelectSquad: (id: string) => void;
  onCommand: (command: ArenaCommand) => void;
}

export const PhaserArena = forwardRef<ArenaHandle, PhaserArenaProps>(function PhaserArena({ game, quality, onSelectSquad, onCommand }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<BattleScene | null>(null);

  useLayoutEffect(() => {
    if (!hostRef.current) return undefined;
    const scene = new BattleScene({ onSelectSquad, onCommand });
    sceneRef.current = scene;
    const phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: hostRef.current.clientWidth || 1280,
      height: hostRef.current.clientHeight || 720,
      backgroundColor: '#070b09',
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [scene],
      audio: { noAudio: true },
    });
    gameRef.current = phaserGame;
    return () => {
      phaserGame.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setCallbacks({ onSelectSquad, onCommand });
  }, [onCommand, onSelectSquad]);

  useEffect(() => {
    sceneRef.current?.setQuality(quality);
    sceneRef.current?.updateSnapshot(game);
  }, [game, quality]);

  useImperativeHandle(ref, () => ({
    selectSquad: (id) => sceneRef.current?.selectSquad(id),
    focusAt: (x, y) => sceneRef.current?.focusAt(x, y),
    centerOnBase: () => sceneRef.current?.centerOnBase(),
  }), []);

  return <div className="phaser-arena" ref={hostRef} aria-label="Поле сражения" />;
});
