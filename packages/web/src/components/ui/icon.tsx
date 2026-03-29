import { clsx } from "clsx";

type IconName =
  | "plus"
  | "chevron-down"
  | "chevron-right"
  | "send"
  | "stop"
  | "x"
  | "check"
  | "circle-dot"
  | "folder"
  | "file"
  | "git-branch"
  | "loading"
  | "message"
  | "hash"
  | "search"
  | "arrow-left"
  | "paperclip";

const paths: Record<IconName, string> = {
  plus: "M12 5v14M5 12h14",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-right": "m9 18 6-6-6-6",
  send: "M5 12h14M12 5l7 7-7 7",
  stop: "M6 6h12v12H6z",
  x: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  "circle-dot": "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  folder: "M3 7V5a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v2M3 7h18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
  "git-branch": "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 9c0 4-6 6-6 12",
  loading:
    "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  hash: "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16M21 21l-4.35-4.35",
  "arrow-left": "M19 12H5M12 19l-7-7 7-7",
  paperclip:
    "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className, strokeWidth = 2 }: IconProps) {
  if (name === "loading") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={clsx("animate-spin", className)}
      >
        <path d={paths[name]} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
