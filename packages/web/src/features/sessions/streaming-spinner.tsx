import { useState, useEffect, useRef } from "react";

const SYMBOLS = ["·", "✢", "*", "✶", "✻", "✽"];
const SYMBOL_INTERVAL = 120;

const VERBS = [
  "Thinking",
  "Reasoning",
  "Considering",
  "Analyzing",
  "Processing",
  "Evaluating",
  "Reflecting",
  "Pondering",
  "Exploring",
  "Examining",
  "Reviewing",
  "Assessing",
  "Calculating",
  "Planning",
  "Searching",
  "Reading",
  "Understanding",
  "Interpreting",
  "Synthesizing",
  "Organizing",
  "Structuring",
  "Formulating",
  "Developing",
  "Composing",
  "Drafting",
  "Writing",
  "Editing",
  "Refining",
  "Optimizing",
  "Building",
  "Designing",
  "Mapping",
  "Tracing",
  "Scanning",
  "Parsing",
  "Compiling",
  "Resolving",
  "Debugging",
  "Testing",
  "Validating",
  "Checking",
  "Verifying",
  "Confirming",
  "Inspecting",
  "Investigating",
  "Researching",
  "Gathering",
  "Collecting",
  "Sorting",
  "Filtering",
  "Comparing",
  "Contrasting",
  "Weighing",
  "Prioritizing",
  "Selecting",
  "Choosing",
  "Deciding",
  "Determining",
  "Concluding",
  "Summarizing",
  "Abstracting",
  "Generalizing",
  "Specializing",
  "Focusing",
  "Expanding",
  "Narrowing",
  "Deepening",
  "Broadening",
  "Connecting",
  "Linking",
  "Associating",
  "Correlating",
  "Integrating",
  "Merging",
  "Combining",
  "Splitting",
  "Dividing",
  "Separating",
  "Isolating",
  "Extracting",
  "Cogitating",
  "Ruminating",
  "Wibbling",
  "Deliberating",
];

const TYPEWRITER_CHAR_INTERVAL = 50;
const VERB_HOLD_DURATION = 1500;

function pickVerb(): string {
  return VERBS[Math.floor(Math.random() * VERBS.length)];
}

export function StreamingSpinner() {
  const [frame, setFrame] = useState(0);
  const [verb, setVerb] = useState(pickVerb);
  const [visibleChars, setVisibleChars] = useState(0);
  const verbTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Symbol cycling — ping-pong through 12 frames (0..5..0)
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % 12);
    }, SYMBOL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Verb typewriter effect
  useEffect(() => {
    if (visibleChars < verb.length) {
      const timer = setTimeout(() => {
        setVisibleChars((c) => c + 1);
      }, TYPEWRITER_CHAR_INTERVAL);
      return () => clearTimeout(timer);
    }
    // Hold completed verb, then pick a new one
    verbTimerRef.current = setTimeout(() => {
      setVerb(pickVerb());
      setVisibleChars(0);
    }, VERB_HOLD_DURATION);
    return () => clearTimeout(verbTimerRef.current);
  }, [visibleChars, verb]);

  const symbolIndex = frame < 6 ? frame : 11 - frame;
  const symbol = SYMBOLS[symbolIndex];

  return (
    <div className="relative py-2 pl-[30px]">
      {/* Vertical line */}
      <div className="absolute left-[12px] top-0 bottom-0 w-px bg-[var(--color-border-subtle)]" />
      {/* Animated dot */}
      <div className="absolute left-[9px] top-[15px] h-[7px] w-[7px] rounded-full bg-[var(--color-accent)] animate-[timeline-dot-blink_1.2s_ease-in-out_infinite]" />
      {/* Spinner content */}
      <span className="text-base text-[var(--color-accent)]">{symbol}</span>
      <span className="ml-1.5 font-[family-name:var(--font-mono)] text-base text-[var(--color-text-secondary)]">
        {verb.slice(0, visibleChars)}
      </span>
    </div>
  );
}
