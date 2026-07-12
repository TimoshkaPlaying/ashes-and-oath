import Phaser from 'phaser';
import type { BuildingType, GameView, Quality, SquadView, UnitType } from '../types/domain';

export type ArenaCommand =
  | { kind: 'move'; squadId: string; x: number; y: number }
  | { kind: 'targetSquad'; squadId: string; targetSquadId: string };

interface SceneCallbacks {
  onSelectSquad: (squadId: string) => void;
  onCommand: (command: ArenaCommand) => void;
}

interface UnitVisual {
  sprite: Phaser.GameObjects.Sprite;
  baseX: number;
  baseY: number;
  phase: number;
}

interface SquadVisual {
  container: Phaser.GameObjects.Container;
  selection: Phaser.GameObjects.Ellipse;
  healthBack: Phaser.GameObjects.Rectangle;
  healthFill: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  units: UnitVisual[];
  ownerId: string;
  targetX: number;
  targetY: number;
  lastAttackAt: number;
  lastHp: number;
  moving: boolean;
}

interface PooledParticle {
  object: Phaser.GameObjects.Arc;
  busy: boolean;
}

interface PooledProjectile {
  object: Phaser.GameObjects.Arc;
  busy: boolean;
}

const WORLD_WIDTH = 2048;
const WORLD_HEIGHT = 1152;
const FRAME_BY_UNIT: Record<UnitType, number> = { infantry: 0, archer: 1, cavalry: 2, catapult: 3 };
const FRAME_BY_BUILDING: Record<BuildingType, number> = {
  townHall: 0, sawmill: 1, quarry: 2, goldMine: 3, ironMine: 4, farm: 5,
  house: 6, warehouse: 7, market: 8, hospital: 9, barracks: 10, archeryRange: 11,
  stable: 12, siegeWorkshop: 13, forge: 14, wall: 15, gate: 16, tower: 17,
};
const UNIT_ORDER: UnitType[] = ['infantry', 'archer', 'cavalry', 'catapult'];

export class BattleScene extends Phaser.Scene {
  private callbacks: SceneCallbacks;
  private snapshot: GameView | null = null;
  private quality: Quality = 'high';
  private squadVisuals = new Map<string, SquadVisual>();
  private buildingMarkers = new Map<string, Phaser.GameObjects.Container>();
  private selectedSquadId: string | null = null;
  private fog!: Phaser.GameObjects.Graphics;
  private commandMarker!: Phaser.GameObjects.Ellipse;
  private dragStart: Phaser.Math.Vector2 | null = null;
  private dragMoved = false;
  private initialCentered = false;
  private previousPhase: GameView['phase'] | null = null;
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private particles: PooledParticle[] = [];
  private projectiles: PooledProjectile[] = [];
  private ambientObjects: Phaser.GameObjects.GameObject[] = [];
  private fogWisps: Phaser.GameObjects.Ellipse[] = [];
  private constructionEffectAt = new Map<string, number>();
  private buildingHp = new Map<string, number>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(callbacks: SceneCallbacks) {
    super({ key: 'BattleScene' });
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: SceneCallbacks) {
    this.callbacks = callbacks;
  }

  preload() {
    this.load.image('battlefield', '/assets/battlefield.png');
    this.load.spritesheet('unit-atlas', '/assets/units.png', { frameWidth: 384, frameHeight: 512 });
    this.load.spritesheet('building-atlas', '/assets/buildings.png', { frameWidth: 256, frameHeight: 341, endFrame: 17 });
  }

  create() {
    this.cameras.main.setBackgroundColor('#070b09');
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(Math.max(0.82, this.coverZoom()));
    this.add.image(0, 0, 'battlefield').setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(0);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x07100d, 0.08).setDepth(1);
    this.createAmbientEnvironment();

    this.fog = this.add.graphics().setDepth(750).setScrollFactor(1);
    this.commandMarker = this.add.ellipse(0, 0, 54, 26, 0x9e7b34, 0.08)
      .setStrokeStyle(2, 0xd9b85f, 0.9).setDepth(700).setVisible(false);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursorKeys = keyboard.createCursorKeys();
      this.wasd = keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as typeof this.wasd;
    }

    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - deltaY * 0.00065, this.coverZoom(), 1.38));
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.dragStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
        this.dragMoved = false;
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || (!pointer.rightButtonDown() && !pointer.middleButtonDown())) return;
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.dragStart.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.dragStart.y) / camera.zoom;
      this.dragMoved = true;
      this.dragStart.set(pointer.x, pointer.y);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasDragging = this.dragMoved;
      this.dragStart = null;
      this.dragMoved = false;
      if (!pointer.rightButtonReleased() || wasDragging || !this.selectedSquadId || !this.snapshot) return;
      const point = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const target = this.snapshot.squads.find((squad) => squad.ownerId !== this.snapshot?.selfId && squad.visible && Phaser.Math.Distance.Between(point.x, point.y, squad.x, squad.y) < 60);
      if (target) this.callbacks.onCommand({ kind: 'targetSquad', squadId: this.selectedSquadId, targetSquadId: target.id });
      else this.callbacks.onCommand({ kind: 'move', squadId: this.selectedSquadId, x: point.x, y: point.y });
      this.showCommandMarker(point.x, point.y, Boolean(target));
    });

    this.createPools();
    if (this.snapshot) this.applySnapshot(this.snapshot);
  }

  update(time: number, delta: number) {
    const camera = this.cameras.main;
    const speed = (delta / 1000) * 620 / camera.zoom;
    if (this.cursorKeys) {
      if (this.cursorKeys.left.isDown || this.wasd.left.isDown) camera.scrollX -= speed;
      if (this.cursorKeys.right.isDown || this.wasd.right.isDown) camera.scrollX += speed;
      if (this.cursorKeys.up.isDown || this.wasd.up.isDown) camera.scrollY -= speed;
      if (this.cursorKeys.down.isDown || this.wasd.down.isDown) camera.scrollY += speed;
    }

    for (const [id, visual] of this.squadVisuals) {
      visual.container.x = Phaser.Math.Linear(visual.container.x, visual.targetX, Math.min(1, delta * 0.008));
      visual.container.y = Phaser.Math.Linear(visual.container.y, visual.targetY, Math.min(1, delta * 0.008));
      visual.container.setDepth(100 + visual.container.y * 0.01);
      for (const unit of visual.units) {
        if (this.reducedMotion) continue;
        const stride = visual.moving ? 2.5 : 1.1;
        unit.sprite.y = unit.baseY + Math.sin(time * (visual.moving ? 0.012 : 0.006) + unit.phase) * stride;
        unit.sprite.x = unit.baseX + (visual.moving ? Math.cos(time * 0.009 + unit.phase) * 1.5 : 0);
        unit.sprite.angle = visual.moving ? Math.sin(time * 0.01 + unit.phase) * 1.2 : 0;
      }
      const squad = this.snapshot?.squads.find((candidate) => candidate.id === id);
      if (squad?.status === 'fighting' && time - visual.lastAttackAt > (this.quality === 'low' ? 1100 : 680)) {
        const enemy = this.closestEnemy(squad);
        if (enemy) this.attackEffect(squad, enemy, time);
        visual.lastAttackAt = time;
      }
    }
  }

  updateSnapshot(snapshot: GameView) {
    this.snapshot = snapshot;
    if (this.sys.isActive()) this.applySnapshot(snapshot);
  }

  setQuality(quality: Quality) {
    this.quality = quality;
  }

  selectSquad(squadId: string | null) {
    this.selectedSquadId = squadId;
    for (const [id, visual] of this.squadVisuals) visual.selection.setVisible(id === squadId);
    if (squadId) {
      const visual = this.squadVisuals.get(squadId);
      if (visual) this.cameras.main.pan(visual.targetX, visual.targetY, 420, 'Sine.easeInOut');
    }
  }

  focusAt(x: number, y: number) {
    this.cameras.main.pan(x, y, 520, 'Sine.easeInOut');
  }

  centerOnBase() {
    if (!this.snapshot) return;
    const townHall = this.snapshot.buildings.find((building) => building.ownerId === this.snapshot?.selfId && building.type === 'townHall');
    const ownSquad = this.snapshot.squads.find((squad) => squad.ownerId === this.snapshot?.selfId);
    this.focusAt(townHall?.x ?? ownSquad?.x ?? 320, townHall?.y ?? ownSquad?.y ?? 820);
  }

  private applySnapshot(snapshot: GameView) {
    this.syncSquads(snapshot);
    this.syncBuildings(snapshot);
    this.drawFog(snapshot);
    if (!this.initialCentered) {
      this.initialCentered = true;
      this.centerOnBase();
    }
    if (this.previousPhase === 'truce' && snapshot.phase !== 'truce') this.revealArena();
    this.previousPhase = snapshot.phase;
  }

  private syncSquads(snapshot: GameView) {
    const destroyedIds = new Set(snapshot.squads.filter((squad) => squad.status === 'destroyed').map((squad) => squad.id));
    const currentIds = new Set(snapshot.squads.filter((squad) => squad.visible && squad.status !== 'destroyed').map((squad) => squad.id));
    for (const [id, visual] of this.squadVisuals) {
      if (!currentIds.has(id)) {
        if (destroyedIds.has(id)) this.destroySquadVisual(visual);
        else visual.container.destroy(true);
        this.squadVisuals.delete(id);
      }
    }
    for (const squad of snapshot.squads) {
      if (!squad.visible || squad.status === 'destroyed') continue;
      let visual = this.squadVisuals.get(squad.id);
      if (!visual) {
        visual = this.createSquadVisual(squad, snapshot.selfId);
        this.squadVisuals.set(squad.id, visual);
      }
      visual.targetX = squad.x;
      visual.targetY = squad.y;
      const hpPercent = Phaser.Math.Clamp(squad.hp / Math.max(1, squad.maxHp), 0, 1);
      if (squad.hp < visual.lastHp) this.hitSquadVisual(visual, visual.lastHp - squad.hp);
      visual.lastHp = squad.hp;
      visual.moving = squad.status === 'moving' || squad.status === 'retreating' || squad.status === 'returning';
      visual.healthFill.width = 72 * hpPercent;
      visual.healthFill.setFillStyle(hpPercent < 0.3 ? 0xb83b2f : hpPercent < 0.65 ? 0xd19b35 : 0x55a345);
      visual.label.setText(`${squad.index} · ${squad.name}`);
      visual.status.setText(this.statusGlyph(squad.status));
      visual.selection.setVisible(squad.id === this.selectedSquadId);
    }
  }

  private createSquadVisual(squad: SquadView, selfId: string): SquadVisual {
    const isOwn = squad.ownerId === selfId;
    const container = this.add.container(squad.x, squad.y).setDepth(100 + squad.y * 0.01);
    const shadow = this.add.ellipse(0, 18, 88, 34, 0x000000, 0.42);
    const selection = this.add.ellipse(0, 14, 104, 48, isOwn ? 0x2c68af : 0xa6322c, 0.11)
      .setStrokeStyle(2, isOwn ? 0x62a7ef : 0xe05d53, 0.95).setVisible(false);
    const healthBack = this.add.rectangle(0, -46, 76, 7, 0x090b0b, 0.92).setStrokeStyle(1, 0x0c0d0d);
    const healthFill = this.add.rectangle(-36, -46, 72, 4, 0x55a345).setOrigin(0, 0.5);
    const label = this.add.text(0, -61, `${squad.index} · ${squad.name}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f0e1bd', stroke: '#080909', strokeThickness: 3,
    }).setOrigin(0.5);
    const status = this.add.text(43, -47, this.statusGlyph(squad.status), {
      fontFamily: 'Arial', fontSize: '11px', color: '#d9b85f', stroke: '#080909', strokeThickness: 2,
    }).setOrigin(0.5);
    const units = this.createUnitVisuals(squad, isOwn);
    container.add([shadow, selection, ...units.map((unit) => unit.sprite), healthBack, healthFill, label, status]);
    container.setSize(112, 96).setInteractive(new Phaser.Geom.Rectangle(-56, -58, 112, 102), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      this.selectSquad(squad.id);
      this.callbacks.onSelectSquad(squad.id);
    });
    return {
      container, selection, healthBack, healthFill, label, status, units,
      ownerId: squad.ownerId, targetX: squad.x, targetY: squad.y, lastAttackAt: 0, lastHp: squad.hp,
      moving: squad.status === 'moving' || squad.status === 'retreating' || squad.status === 'returning',
    };
  }

  private createUnitVisuals(squad: SquadView, isOwn: boolean): UnitVisual[] {
    const representatives: UnitType[] = [];
    for (const type of UNIT_ORDER) {
      const count = Math.min(type === 'catapult' ? 2 : 3, squad.units[type]);
      for (let index = 0; index < count && representatives.length < 10; index += 1) representatives.push(type);
    }
    const offsets = this.formationOffsets(representatives.length, squad.formation);
    return representatives.map((type, index) => {
      const frame = FRAME_BY_UNIT[type] + (isOwn ? 0 : 4);
      const sprite = this.add.sprite(offsets[index].x, offsets[index].y, 'unit-atlas', frame)
        .setScale(type === 'catapult' ? 0.102 : type === 'cavalry' ? 0.095 : 0.085)
        .setOrigin(0.5, 0.84);
      if (type === 'catapult') sprite.setScale(0.115, 0.095);
      return { sprite, baseX: offsets[index].x, baseY: offsets[index].y, phase: index * 0.9 };
    });
  }

  private formationOffsets(count: number, formation: SquadView['formation']) {
    const result: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / 4);
      const column = index % 4;
      if (formation === 'wedge') {
        result.push({ x: (column - 1.5) * 20 + row * 4, y: row * 15 + Math.abs(column - 1.5) * 5 - 3 });
      } else if (formation === 'loose') {
        result.push({ x: (column - 1.5) * 28 + (row % 2) * 10, y: row * 19 - 4 });
      } else {
        result.push({ x: (column - 1.5) * 21, y: row * 16 - 4 });
      }
    }
    return result;
  }

  private syncBuildings(snapshot: GameView) {
    const visible = snapshot.buildings.filter((building) => building.visible);
    const ids = new Set(visible.map((building) => building.id));
    for (const [id, marker] of this.buildingMarkers) {
      if (!ids.has(id)) {
        marker.destroy(true);
        this.buildingMarkers.delete(id);
      }
    }
    for (const building of visible) {
      let marker = this.buildingMarkers.get(building.id);
      if (!marker) {
        const ring = this.add.ellipse(0, 0, building.type === 'townHall' ? 160 : 82, building.type === 'townHall' ? 82 : 42, building.ownerId === snapshot.selfId ? 0x2b6097 : 0x8b2925, 0.06)
          .setStrokeStyle(1, building.ownerId === snapshot.selfId ? 0x4d8ccb : 0xc24a42, 0.45);
        const buildingScale = this.buildingScale(building.type);
        const sprite = this.add.sprite(0, 12, 'building-atlas', FRAME_BY_BUILDING[building.type])
          .setOrigin(0.5, 0.82).setScale(buildingScale).setName('buildingSprite');
        if (building.ownerId !== snapshot.selfId) sprite.setTint(0xff9b91);
        const level = this.add.text(0, building.type === 'townHall' ? -72 : -47, building.type === 'townHall' ? `РАТУША · ${building.level}` : '', {
          fontFamily: 'Georgia, serif', fontSize: '11px', color: '#d8c594', stroke: '#070908', strokeThickness: 3,
        }).setOrigin(0.5);
        const progressBack = this.add.rectangle(0, 29, 62, 6, 0x080a09, 0.9).setName('progressBack').setVisible(false);
        const progressFill = this.add.rectangle(-29, 29, 58, 3, 0xc39a45, 1).setOrigin(0, 0.5).setName('progressFill').setVisible(false);
        const flag = building.type === 'townHall' ? this.add.text(0, -93, building.ownerId === snapshot.selfId ? '⚑' : '⚐', {
          fontFamily: 'Georgia, serif', fontSize: '29px', color: building.ownerId === snapshot.selfId ? '#4d8fce' : '#c84b43', stroke: '#060807', strokeThickness: 3,
        }).setOrigin(0.25, 1).setName('flag') : null;
        marker = this.add.container(building.x, building.y, flag ? [ring, sprite, level, progressBack, progressFill, flag] : [ring, sprite, level, progressBack, progressFill]).setDepth(50);
        this.buildingMarkers.set(building.id, marker);
      }
      marker.setPosition(building.x, building.y);
      const priorHp = this.buildingHp.get(building.id);
      if (priorHp !== undefined && building.hp < priorHp) {
        this.emitBurst(building.x, building.y - 18, 0xc85b37, this.quality === 'low' ? 4 : 12);
        this.emitBurst(building.x, building.y - 10, 0x4b463c, this.quality === 'low' ? 3 : 9);
        const sprite = marker.getByName('buildingSprite') as Phaser.GameObjects.Sprite | null;
        sprite?.setTintFill(0xff745e);
        this.time.delayedCall(90, () => {
          if (!sprite?.active) return;
          sprite.clearTint();
          if (building.ownerId !== snapshot.selfId) sprite.setTint(0xff9b91);
        });
        if (!this.reducedMotion) {
          this.tweens.add({ targets: marker, x: building.x + Phaser.Math.Between(-6, 6), duration: 55, yoyo: true, repeat: 2 });
          if (building.state === 'destroyed') this.tweens.add({ targets: marker, alpha: 0.16, angle: Phaser.Math.Between(-5, 5), duration: 650, ease: 'Quad.easeIn' });
        }
      }
      this.buildingHp.set(building.id, building.hp);
      marker.setAlpha(building.state === 'destroyed' ? 0.18 : building.state === 'building' ? 0.55 + Math.sin(this.time.now * 0.008) * 0.18 : 1);
      const progressBack = marker.getByName('progressBack') as Phaser.GameObjects.Rectangle | null;
      const progressFill = marker.getByName('progressFill') as Phaser.GameObjects.Rectangle | null;
      const sprite = marker.getByName('buildingSprite') as Phaser.GameObjects.Sprite | null;
      const isWorking = building.state === 'building' || building.state === 'upgrading';
      progressBack?.setVisible(isWorking);
      progressFill?.setVisible(isWorking).setDisplaySize(58 * Phaser.Math.Clamp(building.progress ?? 0, 0, 1), 3);
      if (sprite) {
        const baseScale = this.buildingScale(building.type);
        if (building.state === 'building') {
          const progress = Phaser.Math.Clamp(building.progress ?? 0, 0, 1);
          sprite.setScale(baseScale * (0.58 + progress * 0.42)).setAlpha(0.42 + progress * 0.58).setY(12 + (1 - progress) * 14);
        } else if (building.state === 'upgrading' && !this.reducedMotion) {
          const pulse = 1 + Math.sin(this.time.now * 0.009) * 0.045;
          sprite.setScale(baseScale * pulse).setAlpha(0.84 + Math.sin(this.time.now * 0.008) * 0.12).setY(12);
        } else {
          sprite.setScale(baseScale).setAlpha(building.state === 'destroyed' ? 0.22 : 1).setY(12);
        }
      }
      const flag = marker.getByName('flag') as Phaser.GameObjects.Text | null;
      if (flag && !this.reducedMotion) flag.setScale(1 + Math.sin(this.time.now * 0.006) * 0.045, 1);
      const lastEffect = this.constructionEffectAt.get(building.id) ?? 0;
      if (isWorking && this.time.now - lastEffect > (this.quality === 'low' ? 1400 : 620)) {
        this.constructionEffectAt.set(building.id, this.time.now);
        this.emitBurst(building.x + Phaser.Math.Between(-20, 20), building.y - 12, 0xe0a24b, this.quality === 'low' ? 2 : 5);
      }
    }
  }

  private drawFog(snapshot: GameView) {
    this.fog.clear();
    if (snapshot.phase === 'truce') {
      const ownX = snapshot.squads.find((squad) => squad.ownerId === snapshot.selfId)?.x
        ?? snapshot.buildings.find((building) => building.ownerId === snapshot.selfId)?.x
        ?? 300;
      const ownLeft = ownX < WORLD_WIDTH / 2;
      const start = ownLeft ? WORLD_WIDTH * 0.48 : 0;
      const width = WORLD_WIDTH * 0.52;
      this.fog.fillStyle(0x050909, 0.94).fillRect(start, 0, width, WORLD_HEIGHT);
      for (let band = 0; band < 5; band += 1) {
        const alpha = 0.16 - band * 0.025;
        if (ownLeft) this.fog.fillStyle(0x07100e, alpha).fillRect(start - (band + 1) * 80, 0, 80, WORLD_HEIGHT);
        else this.fog.fillStyle(0x07100e, alpha).fillRect(width + band * 80, 0, 80, WORLD_HEIGHT);
      }
      this.ensureFogWisps(start, width);
      for (const wisp of this.fogWisps) wisp.setVisible(true);
    } else {
      for (const wisp of this.fogWisps) wisp.setVisible(false);
      this.fog.fillStyle(0x07100e, 0.08).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      this.fog.fillStyle(0x0a1210, 0.12).fillCircle(1024, 90, 330);
    }
  }

  private showCommandMarker(x: number, y: number, attack: boolean) {
    this.commandMarker.setPosition(x, y).setStrokeStyle(2, attack ? 0xe35b4b : 0xd9b85f, 0.95).setVisible(true).setScale(0.5).setAlpha(1);
    this.tweens.killTweensOf(this.commandMarker);
    this.tweens.add({ targets: this.commandMarker, scaleX: 1.35, scaleY: 1.35, alpha: 0, duration: 680, ease: 'Cubic.easeOut', onComplete: () => this.commandMarker.setVisible(false) });
  }

  private revealArena() {
    if (this.reducedMotion) {
      this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2).setZoom(Math.max(0.72, this.coverZoom()));
      return;
    }
    this.cameras.main.pan(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1_250, 'Cubic.easeInOut');
    this.cameras.main.zoomTo(Math.max(0.72, this.coverZoom()), 1_150, 'Sine.easeInOut');
    this.cameras.main.flash(420, 228, 194, 100, false);
    this.cameras.main.shake(460, 0.006);
    this.emitBurst(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 0xd4aa4a, this.quality === 'low' ? 8 : 24);
  }

  private createPools() {
    const particleCount = this.quality === 'low' ? 24 : 72;
    for (let index = 0; index < particleCount; index += 1) {
      this.particles.push({ object: this.add.circle(-100, -100, 2, 0xd8a746).setDepth(650).setVisible(false), busy: false });
    }
    for (let index = 0; index < 20; index += 1) {
      this.projectiles.push({ object: this.add.circle(-100, -100, 3, 0xdac072).setDepth(640).setVisible(false), busy: false });
    }
  }

  private emitBurst(x: number, y: number, color: number, count: number) {
    const available = this.particles.filter((particle) => !particle.busy).slice(0, count);
    for (const particle of available) {
      particle.busy = true;
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(22, 105);
      particle.object.setPosition(x, y).setFillStyle(color).setVisible(true).setAlpha(1).setScale(Phaser.Math.FloatBetween(0.6, 1.8));
      this.tweens.add({
        targets: particle.object,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance * 0.55,
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(360, 760),
        ease: 'Cubic.easeOut',
        onComplete: () => { particle.object.setVisible(false); particle.busy = false; },
      });
    }
  }

  private closestEnemy(squad: SquadView) {
    let closest: SquadView | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const candidate of this.snapshot?.squads ?? []) {
      if (candidate.ownerId === squad.ownerId || !candidate.visible || candidate.status === 'destroyed') continue;
      const current = Phaser.Math.Distance.Between(squad.x, squad.y, candidate.x, candidate.y);
      if (current < distance) { closest = candidate; distance = current; }
    }
    return closest;
  }

  private attackEffect(attacker: SquadView, target: SquadView, time: number) {
    const attackerVisual = this.squadVisuals.get(attacker.id);
    if (attackerVisual && !this.reducedMotion) {
      const striker = attackerVisual.units[Math.floor(time / 100) % Math.max(1, attackerVisual.units.length)]?.sprite;
      if (striker) this.tweens.add({ targets: striker, scaleX: striker.scaleX * 1.08, scaleY: striker.scaleY * 1.08, angle: attacker.ownerId === this.snapshot?.selfId ? 4 : -4, yoyo: true, duration: 110, ease: 'Quad.easeOut' });
    }
    const hasRanged = attacker.units.archer + attacker.units.catapult > 0;
    if (!hasRanged) {
      this.emitBurst(target.x, target.y, 0xd65b38, this.quality === 'low' ? 3 : 8);
      return;
    }
    const projectile = this.projectiles.find((item) => !item.busy);
    if (!projectile) return;
    projectile.busy = true;
    const isStone = attacker.units.catapult > 0 && Math.floor(time / 680) % 3 === 0;
    projectile.object.setRadius(isStone ? 6 : 2).setFillStyle(isStone ? 0x5d5546 : 0xd9bb62)
      .setPosition(attacker.x, attacker.y - 22).setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: projectile.object,
      x: target.x,
      y: target.y - (isStone ? 38 : 10),
      duration: isStone ? 760 : 340,
      ease: isStone ? 'Sine.easeInOut' : 'Linear',
      onComplete: () => {
        projectile.object.setVisible(false);
        projectile.busy = false;
        this.emitBurst(target.x, target.y, isStone ? 0xc67a35 : 0xe4c768, this.quality === 'low' ? 4 : isStone ? 16 : 7);
        if (isStone) this.cameras.main.shake(160, 0.003);
      },
    });
  }

  private statusGlyph(status: SquadView['status']) {
    switch (status) {
      case 'moving': return '➤';
      case 'fighting': return '⚔';
      case 'retreating': return '↩';
      case 'healing': return '✚';
      case 'attackingBuilding': return '🔥';
      default: return '◆';
    }
  }

  private coverZoom() {
    const camera = this.cameras.main;
    return Math.max(camera.width / WORLD_WIDTH, camera.height / WORLD_HEIGHT);
  }

  private buildingScale(type: BuildingType) {
    if (type === 'townHall') return 0.45;
    if (type === 'wall' || type === 'gate') return 0.36;
    if (type === 'tower') return 0.38;
    if (type === 'farm' || type === 'market') return 0.34;
    return 0.32;
  }

  private hitSquadVisual(visual: SquadVisual, damage: number) {
    const x = visual.container.x;
    const y = visual.container.y;
    this.emitBurst(x, y, 0xd94f3f, this.quality === 'low' ? 3 : 9);
    const text = this.add.text(x + Phaser.Math.Between(-18, 18), y - 56, `−${Math.max(1, Math.round(damage))}`, {
      fontFamily: 'Inter, Arial, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#ff8b6c', stroke: '#260706', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(720);
    for (const unit of visual.units) unit.sprite.setTintFill(0xff806d);
    if (this.reducedMotion) {
      text.destroy();
      for (const unit of visual.units) unit.sprite.clearTint();
      return;
    }
    this.time.delayedCall(75, () => { for (const unit of visual.units) unit.sprite.clearTint(); });
    this.tweens.add({ targets: text, y: y - 92, alpha: 0, duration: 680, ease: 'Cubic.easeOut', onComplete: () => text.destroy() });
    this.tweens.add({ targets: visual.container, x: x + Phaser.Math.Between(-4, 4), duration: 45, yoyo: true, repeat: 2 });
  }

  private destroySquadVisual(visual: SquadVisual) {
    visual.container.disableInteractive();
    visual.selection.setVisible(false);
    this.emitBurst(visual.container.x, visual.container.y, 0xb83e31, this.quality === 'low' ? 7 : 22);
    this.emitBurst(visual.container.x, visual.container.y, 0x4a4237, this.quality === 'low' ? 4 : 13);
    if (this.reducedMotion) {
      visual.container.destroy(true);
      return;
    }
    visual.label.setText('Уничтожен');
    visual.healthFill.width = 0;
    visual.units.forEach((unit, index) => this.tweens.add({
      targets: unit.sprite,
      angle: index % 2 ? 78 : -78,
      y: unit.baseY + 18,
      alpha: 0,
      duration: 480 + index * 28,
      ease: 'Quad.easeIn',
    }));
    this.tweens.add({ targets: visual.container, alpha: 0, delay: 480, duration: 420, onComplete: () => visual.container.destroy(true) });
  }

  private createAmbientEnvironment() {
    if (this.reducedMotion) return;
    const shimmerCount = this.quality === 'low' ? 4 : this.quality === 'medium' ? 8 : 14;
    for (let index = 0; index < shimmerCount; index += 1) {
      const progress = index / Math.max(1, shimmerCount - 1);
      const x = 640 + progress * 900 + Phaser.Math.Between(-60, 60);
      const y = 260 + progress * 630 + Phaser.Math.Between(-35, 35);
      const shimmer = this.add.ellipse(x, y, Phaser.Math.Between(18, 46), 2, 0xbad5cf, 0.05).setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
      this.ambientObjects.push(shimmer);
      this.tweens.add({ targets: shimmer, x: x + Phaser.Math.Between(18, 45), alpha: { from: 0.02, to: 0.13 }, duration: Phaser.Math.Between(1900, 3800), yoyo: true, repeat: -1, delay: index * 130 });
    }
    if (this.quality !== 'low') {
      [[210, 805], [1810, 205]].forEach(([x, y], baseIndex) => {
        for (let index = 0; index < (this.quality === 'high' ? 7 : 4); index += 1) {
          const ember = this.add.circle(x + Phaser.Math.Between(-45, 45), y + Phaser.Math.Between(-35, 25), 1.5, 0xf0913f, 0.55).setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
          this.ambientObjects.push(ember);
          this.tweens.add({ targets: ember, y: y - Phaser.Math.Between(35, 90), x: ember.x + Phaser.Math.Between(-18, 18), alpha: 0, duration: Phaser.Math.Between(1800, 3200), repeat: -1, delay: index * 420 + baseIndex * 170 });
        }
      });
    }
  }

  private ensureFogWisps(start: number, width: number) {
    if (this.fogWisps.length || this.reducedMotion) return;
    const count = this.quality === 'low' ? 5 : this.quality === 'medium' ? 9 : 14;
    for (let index = 0; index < count; index += 1) {
      const x = start + Phaser.Math.Between(0, Math.max(1, Math.floor(width)));
      const y = Phaser.Math.Between(30, WORLD_HEIGHT - 30);
      const wisp = this.add.ellipse(x, y, Phaser.Math.Between(130, 330), Phaser.Math.Between(35, 95), 0x33413d, Phaser.Math.FloatBetween(0.05, 0.14))
        .setDepth(760).setBlendMode(Phaser.BlendModes.SCREEN);
      this.fogWisps.push(wisp);
      this.tweens.add({
        targets: wisp,
        x: x + Phaser.Math.Between(-130, 130),
        scaleX: { from: 0.8, to: 1.18 },
        alpha: { from: 0.035, to: 0.16 },
        duration: Phaser.Math.Between(4200, 7600),
        yoyo: true,
        repeat: -1,
        delay: index * 210,
      });
    }
  }
}
