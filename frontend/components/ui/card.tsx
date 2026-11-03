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
      className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-xs', className)}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          {title && <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
