import Link from "next/link";
import { cn } from "@/lib/cn";

export function Card({
  className,
  children,
  padding = "p-5",
}: {
  className?: string;
  children: React.ReactNode;
  padding?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-(--color-border) bg-(--color-bg-card)", padding, className)}>
      {children}
    </div>
  );
}

const badgeTones = {
  success: "bg-(--color-success-bg) text-(--color-success-text)",
  successAlt: "bg-(--color-success-bg-alt) text-(--color-success-text-dark)",
  gold: "bg-(--color-gold-chip-bg) text-(--color-gold-text)",
  danger: "bg-(--color-danger-bg) text-(--color-danger-text)",
  neutral: "bg-(--color-bg-page) text-(--color-text-mutedalt)",
  dark: "bg-[#221E1A] text-white",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof badgeTones;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap",
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const buttonVariants = {
  primary: "bg-(--color-primary) text-white hover:bg-(--color-primary-hover)",
  secondary: "border border-(--color-border-strong) bg-white text-(--color-text) hover:bg-(--color-bg-subtle)",
  ghost: "text-(--color-text-secondary) hover:bg-(--color-bg-subtle)",
  danger: "bg-(--color-danger-text) text-white hover:opacity-90",
  dark: "bg-[#221E1A] text-white hover:opacity-90",
};

const buttonSizes = {
  sm: "h-8 px-3 text-[12.5px]",
  md: "h-[38px] px-4 text-[13.5px]",
  lg: "h-[46px] px-5 text-[14.5px]",
};

type ButtonBaseProps = {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonBaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: ButtonBaseProps & { href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold no-underline hover:no-underline transition-colors",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
    >
      {children}
    </Link>
  );
}

export function ProgressBar({
  percent,
  color = "var(--color-primary)",
  trackColor = "#EFE9DE",
  height = 7,
}: {
  percent: number;
  color?: string;
  trackColor?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="rounded-full overflow-hidden" style={{ background: trackColor, height }}>
      <div className="h-full rounded-full" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="h-[70px] border-b border-(--color-border) flex items-center gap-3.5 px-7 bg-(--color-bg-app) sticky top-0 z-10">
      <div>
        {eyebrow && <div className="text-[12.5px] text-(--color-text-muted)">{eyebrow}</div>}
        <div className="text-[19px] font-semibold tracking-tight mt-0.5">{title}</div>
        {subtitle && <div className="text-[12.5px] text-(--color-text-muted) mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex-1" />
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: color }} />;
}

export function Avatar({ initials, tone = "success" }: { initials: string; tone?: "success" | "gold" }) {
  const bg = tone === "success" ? "bg-(--color-success-bg)" : "bg-(--color-gold-chip-bg)";
  const fg = tone === "success" ? "text-(--color-success-text-dark)" : "text-(--color-gold-text)";
  return (
    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center font-bold text-[16px]", bg, fg)}>
      {initials}
    </div>
  );
}
