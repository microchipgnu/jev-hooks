export type IconName =
  | "globe"
  | "graph"
  | "layers"
  | "clock"
  | "activity"
  | "target"
  | "plus"
  | "minus"
  | "reset"
  | "chevron";
const paths: Record<IconName, string> = {
  globe:
    "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM4 12h16M12 4c5 5 5 11 0 16-5-5-5-11 0-16Z",
  graph: "M6 6h4v4H6zM15 4h4v4h-4zM15 15h4v4h-4zM8 10v7h7M10 8h2V6h3",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  clock: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM12 7v5l3 2",
  activity: "M3 12h4l3-7 4 14 3-7h4",
  target:
    "M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5m13-4a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  reset: "M4 10a8 8 0 1 1 1 7M4 4v6h6",
  chevron: "m9 6 6 6-6 6",
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
