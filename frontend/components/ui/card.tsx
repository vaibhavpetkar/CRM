import { cn } from '@/lib/utils';

type CardProps = {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
};

export default function Card({ children, className, title, action, onClick, draggable, onDragStart, onDragEnd }: CardProps) {
  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn('rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_8px_rgb(0,0,0,0.04)]', className)}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100/80 px-6 py-4">
          {title && <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
