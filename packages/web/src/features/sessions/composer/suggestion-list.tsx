import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { SearchEntry } from "../../../api/filesystem";

type Props = {
  items: SearchEntry[];
  command: (item: SearchEntry) => void;
};

export type SuggestionListHandle = {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean;
};

export const SuggestionList = forwardRef<SuggestionListHandle, Props>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const selectedRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      selectedRef.current?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[selectedIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) return null;

    return (
      <div
        className="overflow-hidden rounded-t-lg border border-b-0 shadow-md flex flex-col max-h-[300px]"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          borderColor: "var(--color-border-subtle)",
          color: "var(--color-text-primary)",
        }}
      >
        <div
          className="shrink-0 border-b px-3 py-1.5 text-xs font-medium"
          style={{
            borderColor: "var(--color-border-subtle)",
            color: "var(--color-text-tertiary)",
          }}
        >
          Files
        </div>
        <div className="overflow-y-auto p-1">
          {items.map((item, index) => (
            <button
              key={item.path}
              ref={index === selectedIndex ? selectedRef : undefined}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left"
              style={{
                backgroundColor:
                  index === selectedIndex
                    ? "var(--color-bg-hover)"
                    : "transparent",
              }}
              onClick={() => command(item)}
              onMouseEnter={() => setSelectedIndex(index)}
              type="button"
            >
              <span
                className="shrink-0"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {item.isDirectory ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                  </svg>
                )}
              </span>
              <span className="shrink-0">{item.name}</span>
              {item.isDirectory && (
                <>
                  <span className="flex-1" />
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  },
);

SuggestionList.displayName = "SuggestionList";
