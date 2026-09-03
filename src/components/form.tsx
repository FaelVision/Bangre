import { cn } from "@/lib/cn";

export const baseFieldClass =
  "w-full rounded-[10px] border border-(--color-border-strong) bg-white px-3.5 text-[14.5px] text-(--color-text) placeholder:text-(--color-text-placeholder) focus:outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-success-bg)";

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">{children}</span>;
}

export function Field({ children }: { children: React.ReactNode }) {
  return <label className="block">{children}</label>;
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseFieldClass, "h-[46px]", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(baseFieldClass, "h-[46px] appearance-none bg-no-repeat", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseFieldClass, "py-3", className)} {...props} />;
}

export function Checkbox({
  className,
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-[13px] text-(--color-text-secondary) cursor-pointer", className)}>
      <input type="checkbox" className="w-[16px] h-[16px] rounded-[5px] accent-(--color-primary)" {...props} />
      {label}
    </label>
  );
}
