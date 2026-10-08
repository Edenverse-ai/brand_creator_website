"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Box, Check, ChevronDown, Volume2, VolumeX } from "lucide-react";
import type { ModelLimits, VideoMode, VideoModel } from "@/lib/seedance/models";
import { DURATION_MIN, RATIOS, type Ratio, type Resolution } from "@/lib/seedance/schema";

/** What the selected model can produce; the format controls offer nothing beyond it. */
export type FormatLimits = ModelLimits;

export type FormatValue = {
  ratio: Ratio;
  resolution: Resolution;
  duration: number;
  generateAudio: boolean;
};

const PILL =
  "inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-indigo-400 data-[state=open]:bg-indigo-50/60";
const PANEL = "z-50 rounded-2xl border border-slate-200 bg-white shadow-xl";
const FIELD_LABEL = "text-xs font-semibold uppercase tracking-wide text-slate-500";

/** A rectangle drawn at the ratio's true proportions, so the shape reads at a glance. */
export function RatioGlyph({ ratio, size = 18 }: { ratio: Ratio; size?: number }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = size / Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <span
        className="rounded-[3px] border-2 border-current"
        style={{ width: Math.round(w * scale), height: Math.round(h * scale) }}
      />
    </span>
  );
}

export function ModelPicker({
  models,
  value,
  onChange,
  className = "",
}: {
  models: readonly VideoModel[];
  value: VideoMode;
  onChange: (mode: VideoMode) => void;
  className?: string;
}) {
  const current = models.find((model) => model.mode === value);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Model" className={`${PILL} ${className}`}>
        <Box className="h-4 w-4 shrink-0 text-indigo-500" />
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={8} className={`${PANEL} w-64 p-2`}>
          {models.map((model) => {
            const selected = model.mode === value;
            return (
              <DropdownMenu.Item
                key={model.mode}
                onSelect={() => onChange(model.mode)}
                className={`flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2.5 outline-none data-[highlighted]:bg-slate-50 ${
                  selected ? "bg-indigo-50 text-indigo-700" : "text-slate-700"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{model.label}</span>
                  <span
                    className={`block text-xs ${selected ? "text-indigo-500" : "text-slate-500"}`}
                  >
                    Up to {model.maxDuration}s · up to {model.resolutions[0]}
                  </span>
                </span>
                {selected && <Check className="ml-auto h-4 w-4 shrink-0" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function clampDuration(value: number, max: number): number {
  if (!Number.isFinite(value)) return DURATION_MIN;
  return Math.min(max, Math.max(DURATION_MIN, Math.round(value)));
}

/** Ratio, resolution, duration and audio. Inline on small screens, in a popover on large ones. */
export function FormatFields({
  value,
  limits,
  onChange,
}: {
  value: FormatValue;
  limits: FormatLimits;
  onChange: (patch: Partial<FormatValue>) => void;
}) {
  const setDuration = (raw: string) =>
    onChange({ duration: clampDuration(Number(raw), limits.maxDuration) });

  return (
    <div className="space-y-5">
      <div>
        <p className={FIELD_LABEL}>Aspect ratio</p>
        <div className="mt-2 grid grid-cols-5 gap-2" role="group" aria-label="Aspect ratio">
          {RATIOS.map((ratio) => {
            const selected = ratio === value.ratio;
            return (
              <button
                key={ratio}
                type="button"
                aria-pressed={selected}
                aria-label={ratio}
                onClick={() => onChange({ ratio })}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <RatioGlyph ratio={ratio} size={24} />
                {ratio}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={FIELD_LABEL}>Resolution</p>
        <div
          className="mt-2 grid gap-1 rounded-xl bg-slate-100 p-1"
          style={{ gridTemplateColumns: `repeat(${limits.resolutions.length}, minmax(0, 1fr))` }}
          role="group"
          aria-label="Resolution"
        >
          {limits.resolutions.map((resolution) => {
            const selected = resolution === value.resolution;
            return (
              <button
                key={resolution}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ resolution })}
                className={`rounded-lg py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {resolution}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={FIELD_LABEL}>Duration</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <input
              type="range"
              aria-label="Duration"
              min={DURATION_MIN}
              max={limits.maxDuration}
              step={1}
              value={value.duration}
              onChange={(event) => setDuration(event.target.value)}
              className="block w-full accent-indigo-500 disabled:opacity-60"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>{DURATION_MIN}s</span>
              <span>{limits.maxDuration}s</span>
            </div>
          </div>
          <label className="flex shrink-0 items-center gap-1 self-start rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1 text-sm text-slate-500">
            <input
              type="number"
              aria-label="Duration in seconds"
              min={DURATION_MIN}
              max={limits.maxDuration}
              step={1}
              value={value.duration}
              onChange={(event) => setDuration(event.target.value)}
              className="w-9 bg-transparent text-right font-semibold tabular-nums text-slate-900 focus:outline-none"
            />
            s
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
        <div className="flex items-center gap-3">
          {value.generateAudio ? (
            <Volume2 className="h-4 w-4 text-indigo-500" />
          ) : (
            <VolumeX className="h-4 w-4 text-slate-400" />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-700">Generate audio</p>
            <p className="text-xs text-slate-500">Voices, sound effects and music.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.generateAudio}
          aria-label="Generate audio"
          onClick={() => onChange({ generateAudio: !value.generateAudio })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
            value.generateAudio ? "bg-indigo-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
              value.generateAudio ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export function FormatPopover({
  value,
  limits,
  onChange,
}: {
  value: FormatValue;
  limits: FormatLimits;
  onChange: (patch: Partial<FormatValue>) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger aria-label="Format" className={PILL}>
        <RatioGlyph ratio={value.ratio} />
        <span>{value.ratio}</span>
        <span className="h-4 w-px bg-slate-200" />
        <span>{value.resolution}</span>
        <span className="h-4 w-px bg-slate-200" />
        <span className="tabular-nums">{value.duration}s</span>
        {!value.generateAudio && <VolumeX className="h-4 w-4 text-slate-400" />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={8} className={`${PANEL} w-[22rem] p-5`}>
          <FormatFields value={value} limits={limits} onChange={onChange} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
