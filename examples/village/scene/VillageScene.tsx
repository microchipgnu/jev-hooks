import type { CSSProperties } from "react";
import { useSimulation } from "../simulation/provider.js";
import {
  districtIds,
  householdSeeds,
  scopePath,
  type DistrictId,
} from "../simulation/world.js";
import {
  DistrictSemantics,
  FamilySemantics,
  PersonSemantics,
  useMeaning,
  answerValue,
} from "../semantic/providers.js";
import { LensPortal } from "../inspector/Inspector.js";
import { useLens } from "./lens.js";
import { behaviorFor } from "./behavior.js";
const places: Record<
  DistrictId,
  { x: number; y: number; width: number; labelY: number }
> = {
  farms: { x: 433, y: 120, width: 285, labelY: -94 },
  square: { x: 458, y: 305, width: 225, labelY: -73 },
  market: { x: 212, y: 340, width: 250, labelY: -103 },
  docks: { x: 700, y: 382, width: 215, labelY: -114 },
  oldtown: { x: 345, y: 554, width: 280, labelY: -100 },
};
function House({
  x = 0,
  y = 0,
  color = "#ba7961",
  size = 1,
}: {
  x?: number;
  y?: number;
  color?: string;
  size?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`} className="mini-house">
      <ellipse cx="6" cy="22" rx="39" ry="13" fill="#47472d" opacity=".1" />
      <path d="M-29 -13L0 -27 31 -11 31 23 0 39-29 21Z" fill="#e7d8b2" />
      <path d="M0 -27L31 -11V23L0 39Z" fill="#cabc96" />
      <path d="M-36 -13L0 -43 38 -10 2 8Z" fill={color} />
      <path
        d="M-36 -13L2 8 38-10 33-3 2 14-34-7Z"
        fill="#785e48"
        opacity=".55"
      />
      <path d="M-19 9l10 5v17l-10-5Z" fill="#645e4c" />
      <path d="M10 12l10-5v9l-10 5Z" fill="#e5bc6a" />
      <path d="M13-32v-17l9 4v19" fill="#aa9b7c" />
    </g>
  );
}
function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="15" rx="17" ry="6" fill="#686d45" opacity=".13" />
      <path d="M0 0v18" stroke="#8f8261" strokeWidth="4" />
      <path
        d="M-19 3Q-22-13-10-17Q-12-35 4-33Q24-32 20-11Q34 6 17 10Q1 20-19 3"
        fill="#a2aa79"
      />
      <path
        d="M0-27Q-11-4-2 9"
        fill="none"
        stroke="#b9be8d"
        strokeWidth="4"
        opacity=".6"
      />
    </g>
  );
}
function Crate({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-10-8L2-14 14-7 1-1Z" fill="#cbaa72" />
      <path d="M-10-8L1-1v15l-11-7Z" fill="#b08e5d" />
      <path d="M1-1L14-7v14L1 14Z" fill="#967a51" />
      <path
        d="M-8-4L-1 8m-7-3L-1 0M4 2l7 4"
        stroke="#d9c499"
        strokeWidth="1.5"
      />
    </g>
  );
}
function Stall({ x, y, closed }: { x: number; y: number; closed: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-27 1v35m51-35v35" stroke="#817252" strokeWidth="3" />
      <path
        d="M-33-10L-14-24 35-3 20 14Z"
        fill={closed ? "#aaa58c" : "#aab487"}
      />
      {!closed &&
        [0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M${-27 + i * 12} -13l14 6 15-14-12-5Z`}
            transform="translate(0 17)"
            fill="#eee4c9"
          />
        ))}
      <path d="M-28 25L0 12 28 25 0 39Z" fill="#c0a277" />
      <path d="M-28 25L0 39 28 25v10L0 49-28 36Z" fill="#99805a" />
      {!closed && (
        <g fill="#b78152">
          <circle cx="-9" cy="27" r="4" />
          <circle cx="0" cy="24" r="4" />
          <circle cx="9" cy="28" r="4" />
        </g>
      )}
    </g>
  );
}
function DistrictVisual({ id }: { id: DistrictId }) {
  const { world } = useSimulation();
  const mood = answerValue(useMeaning("district.mood")?.data),
    pressure = answerValue(useMeaning("district.pressure")?.data),
    concern = answerValue(useMeaning("village.concern")?.data);
  const lens = useLens(),
    p = places[id],
    active = scopePath(lens.selected, world).includes(`district:${id}`);
  return (
    <g
      className={`district-shape ${active ? "selected" : ""} ${lens.hovered === `district:${id}` ? "hovered" : ""}`}
    >
      <ellipse
        className="district-ground"
        rx={p.width / 2}
        ry={id === "farms" ? 71 : 78}
        cy="7"
      />
      <ellipse
        className="scope-ring"
        rx={p.width / 2 + 7}
        ry={id === "farms" ? 82 : 89}
        cy="7"
      />
      {id === "farms" && (
        <>
          <path d="M-109-26L-33-51 48-21-29 15Z" fill="#b8b887" />
          {Array.from({ length: 7 }, (_, i) => (
            <path
              key={i}
              d={`M${-95 + i * 11} ${-25 - i * 3.5}l75 30`}
              stroke="#d7cf97"
              strokeWidth="4"
            />
          ))}
          <House x={61} y={-18} color="#928665" size={0.9} />
          <g transform="translate(-72 32)">
            <path d="M-9 20L-5-18 8-18 13 20Z" fill="#ded5b6" />
            <g className={concern === "food" ? "mill fast" : "mill"}>
              <path
                d="M0-17V-47M0-17H30M0-17V13M0-17H-30"
                stroke="#8d805e"
                strokeWidth="5"
              />
              <path
                d="M0-42h6v20M25-17v6H5M0 8h-6v-20M-25-17v-6h20"
                fill="none"
                stroke="#e7debf"
                strokeWidth="5"
              />
            </g>
          </g>
          {concern === "food" && (
            <text className="map-note" x="-5" y="-61">
              GRANARY PRIORITY
            </text>
          )}
        </>
      )}
      {id === "square" && (
        <>
          <path d="M-50-37L11-56 60-27 1 1Z" fill="#d9d1b8" />
          <House x={-59} y={-11} color="#8b9980" size={0.65} />
          <g transform="translate(20 8)">
            <ellipse rx="35" ry="17" cy="10" fill="#adae9a" />
            <ellipse rx="30" ry="13" cy="5" fill="#c7d6cc" />
            <ellipse rx="21" ry="8" cy="4" fill="#9db8b4" />
            <path d="M-5 4V-30h10V4" fill="#dcd6bc" />
            <ellipse rx="16" ry="7" cy="-25" fill="#c8c4a9" />
            <path
              d="M-10-23q10-19 20 0"
              fill="none"
              stroke="#c6ded7"
              strokeWidth="3"
            />
          </g>
          <path d="M-15 47l20-8m3 13l20-8" stroke="#a39b7c" strokeWidth="4" />
          {Array.from(
            { length: Math.min(world.policies.guards, 5) },
            (_, i) => (
              <path
                key={i}
                d={`M${-50 + i * 9} 38v12`}
                stroke="#637f82"
                strokeWidth="5"
              />
            ),
          )}
        </>
      )}
      {id === "market" && (
        <>
          <House x={-18} y={-45} color="#bd8264" size={0.9} />
          <Stall
            x={-60}
            y={12}
            closed={!world.policies.marketOpen || mood === "angry"}
          />
          <Stall x={30} y={23} closed={!world.policies.marketOpen} />
          <Crate x={75} y={-5} />
          {concern === "food" && (
            <text className="map-note" x="-65" y="-14">
              FOOD QUEUE
            </text>
          )}
          {mood === "angry" && (
            <text className="map-note" x="-65" y="68">
              CLOSING EARLY
            </text>
          )}
        </>
      )}
      {id === "docks" && (
        <>
          <path d="M-20-5L81 38 81 55-20 10Z" fill="#b69f77" />
          {Array.from({ length: 10 }, (_, i) => (
            <path
              key={i}
              d={`M${-14 + i * 9} ${-1 + i * 4}l-5 14`}
              stroke="#927f5e"
              strokeWidth="1.5"
            />
          ))}
          <House x={-28} y={-41} color="#7f9690" size={0.8} />
          <Crate x={-64} y={13} />
          {pressure !== "trade" && (
            <>
              <Crate x={-44} y={22} />
              <Crate x={-67} y={37} />
              <Crate x={2} y={-1} />
            </>
          )}
          <g className="boat" transform="translate(97 16)">
            <path d="M-13-20q28 4 21 45Q-18 9-13-20" fill="#a78963" />
            <path d="M-5-8L17 12-5 8Z" fill="#f0e5c5" />
            <path d="M-5-15v32" stroke="#847253" strokeWidth="2" />
          </g>
          {pressure === "trade" && (
            <text className="map-note" x="-49" y="61">
              AWAITING TRADE
            </text>
          )}
        </>
      )}
      {id === "oldtown" && (
        <>
          <House x={-60} y={-15} color="#b79470" size={0.85} />
          <House x={4} y={-35} color="#b87961" size={0.9} />
          <House x={69} y={-9} color="#90997c" size={0.7} />
          <path d="M-35 18L23 30" stroke="#a09377" strokeWidth="1.5" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M${-29 + i * 12} ${19 + i * 2.4}v13l8 2v-13Z`}
              fill={i % 2 ? "#d4bdb0" : "#e6ddc4"}
            />
          ))}
        </>
      )}
      <text className="district-label" textAnchor="middle" y={p.labelY}>
        {world.districts[id].name.toUpperCase()}
      </text>
      <text className="district-meaning" textAnchor="middle" y={p.labelY + 16}>
        {mood ?? "move the lens here"}
        {pressure && pressure !== "none" ? ` · ${pressure}` : ""}
      </text>
    </g>
  );
}
const positions: Record<DistrictId, [number, number][]> = {
  square: [
    [-34, 32],
    [60, 34],
    [6, -37],
  ],
  market: [
    [-40, 60],
    [60, 39],
    [72, -31],
  ],
  farms: [
    [-30, 22],
    [17, 40],
    [91, 29],
  ],
  docks: [
    [-29, 48],
    [40, -25],
    [-82, -19],
  ],
  oldtown: [
    [-89, 38],
    [3, 32],
    [51, 48],
  ],
};
function PersonVisual({ id, x, y }: { id: string; x: number; y: number }) {
  const { world } = useSimulation(),
    person = world.people[id]!,
    lens = useLens();
  const attitude = useMeaning("person.attitude"),
    secure = useMeaning("person.secure");
  const concern = useMeaning("village.concern"),
    mood = useMeaning("district.mood"),
    pressure = useMeaning("district.pressure");
  const behavior = behaviorFor(
    person.occupation,
    answerValue(concern?.data),
    answerValue(mood?.data),
    answerValue(pressure?.data),
    answerValue(attitude?.data),
  );
  const selected = lens.selected === `person:${id}`,
    hovered = lens.hovered === `person:${id}`;
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-scope={`person:${id}`}
      tabIndex={0}
      role="button"
      aria-label={`${person.name} · ${person.occupation}`}
      className={`person ${selected ? "selected" : ""} ${hovered ? "hovered" : ""}`}
    >
      <title>
        {person.name} · {person.occupation} · {behavior.label}
      </title>
      <circle className="person-hit" r="22" />
      <ellipse className="person-shadow" rx="10" ry="4" cy="11" />
      <circle className="person-ring" r="19" />
      <g
        className={`person-body ${behavior.motion}`}
        style={{ "--delay": `${id.length * -0.7}s` } as CSSProperties}
      >
        <path
          d="M-4 7L-5 14M4 7L5 14"
          stroke="#675c4a"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M-7 7L-5-5H5L8 7Z"
          fill={
            person.occupation === "guard"
              ? "#658589"
              : person.occupation === "farmer"
                ? "#899365"
                : person.occupation === "merchant"
                  ? "#af7359"
                  : "#978474"
          }
        />
        <circle cy="-10" r="6" fill="#d7b490" />
        <path d="M-7-11q2-10 12-3l2 3" fill="#73634b" />
        {person.occupation === "farmer" && (
          <path d="M-10-13H10" stroke="#bcaa76" strokeWidth="3" />
        )}
        {secure?.data?.type === "noul" && secure.data.noul < 0.4 && (
          <path d="M10-14l5-7" stroke="#af8464" strokeWidth="2" />
        )}
      </g>
      <text className="person-name" textAnchor="middle" y="30">
        {person.name}
      </text>
      {(selected || hovered) && (
        <text className="person-attitude" textAnchor="middle" y="43">
          {answerValue(attitude?.data) ?? "inspect meaning"}
        </text>
      )}
      <LensPortal scopeId={`person:${id}`} />
    </g>
  );
}
function FamilyVisual({ id }: { id: string }) {
  const { world } = useSimulation(),
    family = world.families[id]!,
    lens = useLens(),
    path = scopePath(lens.selected, world);
  const stability = useMeaning("family.stability"),
    grievance = useMeaning("family.grievance");
  const people = Object.values(world.people).filter((p) => p.familyId === id);
  return (
    <g>
      <g
        data-scope={`family:${id}`}
        role="button"
        tabIndex={0}
        aria-label={`${family.name} family`}
        className={`family-label ${path.includes(`family:${id}`) ? "selected" : ""}`}
        transform={
          family.districtId === "farms"
            ? "translate(-85 100)"
            : family.districtId === "market"
              ? "translate(0 128)"
              : "translate(0 100)"
        }
      >
        <rect x="-64" y="-14" width="128" height="23" rx="11" />
        <text textAnchor="middle" y="1">
          {family.name} family
          {stability?.data ? ` · ${answerValue(stability.data)}` : ""}
        </text>
        <title>
          {grievance?.data
            ? `Grievance: ${answerValue(grievance.data)}`
            : "Inspect household meaning"}
        </title>
      </g>
      <LensPortal scopeId={`family:${id}`} />
      {people.map((p, i) => (
        <PersonSemantics
          id={p.id}
          active={lens.selected === `person:${p.id}`}
          key={p.id}
        >
          <PersonVisual
            id={p.id}
            x={positions[family.districtId][i]![0]}
            y={positions[family.districtId][i]![1]}
          />
        </PersonSemantics>
      ))}
    </g>
  );
}
function VillageAtmosphere() {
  const mood = answerValue(useMeaning("village.mood")?.data);
  return (
    <g
      className={`village-atmosphere mood-${mood ?? "unknown"}`}
      aria-hidden="true"
    >
      {mood === "angry" ? (
        [0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${381 + i * 16} 417)`}>
            <circle r="3" fill="#ac9273" />
            <path d="M-3 4v10h7V4" fill="#a38b70" />
          </g>
        ))
      ) : mood === "desperate" ? (
        <path
          d="M112 401h90"
          stroke="#a48f6e"
          strokeWidth="3"
          strokeDasharray="3 10"
        />
      ) : (
        <g className={mood === "anxious" ? "birds slow" : "birds"}>
          <path
            d="M164 163q7-9 14 0q7-9 14 0m23 9q5-7 10 0q5-7 10 0"
            fill="none"
            stroke="#909578"
            strokeWidth="2"
          />
        </g>
      )}
    </g>
  );
}
export function VillageScene() {
  const { world } = useSimulation(),
    lens = useLens(),
    path = scopePath(lens.selected, world);
  const scopeAt = (target: EventTarget | null) =>
    target instanceof Element
      ? (target.closest("[data-scope]")?.getAttribute("data-scope") ??
        "village")
      : "village";
  return (
    <div className="village-scene">
      <div className="map-caption">
        <span>
          <i className="lens-mark" /> SEMANTIC LENS
        </span>
        <span>
          {lens.pinned
            ? "Pinned · Esc to release"
            : "Hover to read · click to pin"}
        </span>
      </div>
      <svg
        viewBox="0 0 900 720"
        role="img"
        aria-label="Interactive Semantic Village map"
        data-scope="village"
        onPointerMove={(event) => {
          if (event.currentTarget.contains(event.target as Node))
            lens.hover(scopeAt(event.target));
        }}
        onClick={(event) => {
          // React portals preserve ancestry: inspector clicks are outside the map.
          if (event.currentTarget.contains(event.target as Node)) {
            const scope = scopeAt(event.target);
            if (scope === "village") lens.unpin();
            else lens.pin(scope);
          }
        }}
        onFocus={(event) => {
          if (event.currentTarget.contains(event.target as Node))
            lens.hover(scopeAt(event.target));
        }}
        onKeyDown={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            lens.pin(scopeAt(event.target));
          }
        }}
      >
        <defs>
          <pattern
            id="water"
            width="37"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M2 12q6-3 13 0m9-8h6"
              stroke="#bccbc2"
              strokeWidth="1"
              fill="none"
            />
          </pattern>
          <pattern
            id="grass"
            width="70"
            height="53"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M8 9l1-3 2 3m44 30l1-3 2 3"
              stroke="#b6ba95"
              strokeWidth="1"
              opacity=".45"
            />
          </pattern>
        </defs>
        <rect width="900" height="720" fill="#eae9d9" />
        <rect width="900" height="720" fill="url(#grass)" />
        <path
          d="M815-30Q720 113 782 198T808 383Q742 493 796 575T889 749H940V-30Z"
          fill="#c4d4ca"
        />
        <path
          d="M815-30Q720 113 782 198T808 383Q742 493 796 575T889 749H940V-30Z"
          fill="url(#water)"
        />
        <path
          d="M439 170Q460 241 459 307Q368 340 224 348M461 307Q575 305 699 383M222 352Q249 468 345 557M459 340Q496 477 363 558M365 574L401 742"
          stroke="#d3cbb2"
          strokeWidth="25"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M439 170Q460 241 459 307Q368 340 224 348M461 307Q575 305 699 383M222 352Q249 468 345 557M459 340Q496 477 363 558M365 574L401 742"
          stroke="#eee4cb"
          strokeWidth="18"
          fill="none"
          strokeLinecap="round"
        />
        {[
          [114, 79, 1.2],
          [196, 94, 0.85],
          [595, 82, 1],
          [627, 129, 0.8],
          [93, 269, 1.1],
          [573, 465, 1.2],
          [645, 529, 0.8],
          [124, 553, 1],
          [554, 619, 1.1],
          [673, 226, 0.8],
          [244, 181, 0.75],
          [631, 624, 0.8],
        ].map(([x, y, scale], i) => (
          <Tree key={i} x={x!} y={y!} scale={scale!} />
        ))}
        <path d="M61 647h35m-17-17v35" stroke="#b0b095" strokeWidth="1" />
        <text x="74" y="622" className="compass">
          N
        </text>
        <text x="676" y="684" className="map-footnote">
          15 lives. One shared world.
        </text>
        <VillageAtmosphere />
        {districtIds.map((id) => (
          <DistrictSemantics
            key={id}
            id={id}
            active={path.includes(`district:${id}`)}
          >
            <g
              transform={`translate(${places[id].x} ${places[id].y})`}
              data-scope={`district:${id}`}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${world.districts[id].name}`}
            >
              <DistrictVisual id={id} />
              <LensPortal scopeId={`district:${id}`} />
              {householdSeeds
                .filter((f) => f.districtId === id)
                .map((f) => (
                  <FamilySemantics
                    key={f.id}
                    id={f.id}
                    active={path.includes(`family:${f.id}`)}
                  >
                    <FamilyVisual id={f.id} />
                  </FamilySemantics>
                ))}
            </g>
          </DistrictSemantics>
        ))}
      </svg>
      <div className="map-key">
        <span>
          <i className="key-dot" /> raw world
        </span>
        <span>
          <i className="key-ring" /> active scope
        </span>
        <span>Movement is code. Meaning is derived.</span>
      </div>
    </div>
  );
}
