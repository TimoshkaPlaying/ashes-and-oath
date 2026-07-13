import { BookOpen, MousePointer2, X } from 'lucide-react';
import { OrnateCorners } from './Common';

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card iron-panel help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <OrnateCorners />
        <header>
          <div><BookOpen size={20} /><h2 id="help-title">Как играть</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть инструкцию"><X size={19} /></button>
        </header>
        <div className="help-intro">
          <MousePointer2 size={30} />
          <p>Укрепите королевство за 30 минут перемирия, соберите до четырёх отрядов и разрушьте вражескую ратушу.</p>
        </div>
        <div className="help-grid">
          <article><kbd>ЛКМ</kbd><div><b>Выбрать отряд</b><span>Щёлкните по бойцам или карточке справа.</span></div></article>
          <article><kbd>ПКМ</kbd><div><b>Отдать приказ</b><span>Движение по земле или атака видимой цели.</span></div></article>
          <article><kbd>WASD</kbd><div><b>Камера</b><span>Перемещайте поле боя; колесо меняет масштаб.</span></div></article>
          <article><kbd>1–4</kbd><div><b>Быстрый выбор</b><span>Выберите один из четырёх отрядов.</span></div></article>
          <article><kbd>B</kbd><div><b>Строительство</b><span>Откройте панель доступных зданий.</span></div></article>
          <article><kbd>Space</kbd><div><b>Вернуться к базе</b><span>Камера плавно покажет вашу ратушу.</span></div></article>
        </div>
        <footer><button type="button" className="gold-button compact" onClick={onClose}>Понятно</button></footer>
      </section>
    </div>
  );
}
