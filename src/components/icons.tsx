import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function Icon({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

export function UsageMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 36 36"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M7 8.5V27.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      <path d="M15 14V27.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      <path d="M23 8.5V27.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      <path d="M31 4.5V27.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      <path d="M5 31.5H33" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M7 8.5L15 14L23 8.5L31 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function ArrowUpRight({ size = 16, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M5 19L19 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M8 5H19V16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </Icon>
  );
}

export function ArrowRight({ size = 16, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M4 12H20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M14 6L20 12L14 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </Icon>
  );
}

export function ChevronDown({ size = 16, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </Icon>
  );
}

export function ChartLine({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M4 18L9 12L13 15L20 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M4 20H20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </Icon>
  );
}

export function CodeBrackets({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M8 6L3 12L8 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M16 6L21 12L16 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M14 4L10 20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </Icon>
  );
}

export function LockClosed({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <rect height="10" rx="2" stroke="currentColor" strokeWidth="1.7" width="14" x="5" y="10" />
      <path d="M8 10V7.5C8 5.57 9.57 4 11.5 4H12.5C14.43 4 16 5.57 16 7.5V10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M12 14V16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </Icon>
  );
}

export function PulseIcon({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M3 12H7L9.2 6L13.4 18L16 11H21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </Icon>
  );
}

export function ShieldCheck({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M12 3L19 6V11.5C19 16.15 16.1 19.63 12 21C7.9 19.63 5 16.15 5 11.5V6L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M8.8 12L11 14.2L15.5 9.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </Icon>
  );
}

export function BookOpen({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M4 5.5C6.8 4.2 9.4 4.7 12 6.3V19C9.4 17.4 6.8 16.9 4 18.2V5.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M20 5.5C17.2 4.2 14.6 4.7 12 6.3V19C14.6 17.4 17.2 16.9 20 18.2V5.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
    </Icon>
  );
}

export function Sparkles({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M12 3L13.6 8.4L19 10L13.6 11.6L12 17L10.4 11.6L5 10L10.4 8.4L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M19 16L19.8 18.2L22 19L19.8 19.8L19 22L18.2 19.8L16 19L18.2 18.2L19 16Z" fill="currentColor" />
    </Icon>
  );
}

export function CopyIcon({ size = 17, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <rect height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" width="11" x="8" y="8" />
      <path d="M16 8V6.5C16 5.67 15.33 5 14.5 5H6.5C5.67 5 5 5.67 5 6.5V14.5C5 15.33 5.67 16 6.5 16H8" stroke="currentColor" strokeWidth="1.6" />
    </Icon>
  );
}

export function DatabaseIcon({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 5.5V12C5 13.38 8.13 14.5 12 14.5C15.87 14.5 19 13.38 19 12V5.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 12V18.5C5 19.88 8.13 21 12 21C15.87 21 19 19.88 19 18.5V12" stroke="currentColor" strokeWidth="1.7" />
    </Icon>
  );
}

export function ActivityIcon({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M4 12H7L9 5L13 19L15.5 12H20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </Icon>
  );
}

export function LayersIcon({ size = 20, ...props }: IconProps) {
  return (
    <Icon size={size} {...props}>
      <path d="M12 3L20 7L12 11L4 7L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M4 12L12 16L20 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M4 17L12 21L20 17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </Icon>
  );
}
