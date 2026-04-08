import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useReadingSpeedState } from '../../hooks/useReadingSpeedState';
import {
  DEFAULT_READING_SPEED_WPM,
  estimateReadingSpeedFromSample,
  formatEstimatedReadingTime,
  formatReadingSpeedWpm,
  setReadingSpeedWpm,
} from '../../utils/readingSpeed';

interface ReadingSpeedSample {
  title: string;
  paragraph: string;
  wordCount: number;
}

interface ReadingSpeedPreferenceProps {
  samples: ReadingSpeedSample[];
}

const PRESET_SPEEDS = [
  { label: 'Careful', value: 180 },
  { label: 'Average', value: DEFAULT_READING_SPEED_WPM },
  { label: 'Fast', value: 300 },
];

function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function randomSample(samples: ReadingSpeedSample[], currentTitle?: string): ReadingSpeedSample | null {
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0];

  let next = samples[Math.floor(Math.random() * samples.length)];
  if (currentTitle && next.title === currentTitle) {
    next = samples.find((sample) => sample.title !== currentTitle) ?? next;
  }
  return next;
}

export default function ReadingSpeedPreference({ samples }: ReadingSpeedPreferenceProps) {
  const readingSpeedWpm = useReadingSpeedState();
  const [inputValue, setInputValue] = useState(String(readingSpeedWpm));
  const [activeSample, setActiveSample] = useState<ReadingSpeedSample | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [measuredSpeed, setMeasuredSpeed] = useState<number | null>(null);

  const paragraphVisible = activeSample !== null && (startedAt !== null || measuredSpeed !== null);

  const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  useEffect(() => {
    setInputValue(String(readingSpeedWpm));
  }, [readingSpeedWpm]);

  useEffect(() => {
    if (startedAt === null) return;

    const interval = window.setInterval(() => {
      setElapsedMs(getNow() - startedAt);
    }, 100);

    return () => window.clearInterval(interval);
  }, [startedAt]);

  const measuredPreview = measuredSpeed
    ? formatEstimatedReadingTime(35000, measuredSpeed)
    : null;

  const sampleStatus = useMemo(() => {
    if (samples.length === 0) return 'No Wikipedia sample is available right now.';
    if (!activeSample) return 'Press Start timer to load a random opening paragraph from the local Wikipedia Vital Articles dataset.';
    if (startedAt !== null) return `Timer running. Read the paragraph, then press Done.`;
    if (measuredSpeed) return `Measured on ${activeSample.wordCount} words from ${activeSample.title}, and saved as your current speed.`;
    return `Press Start timer to load a random opening paragraph from the local Wikipedia Vital Articles dataset.`;
  }, [activeSample, measuredSpeed, samples.length, startedAt]);

  const startMeasurement = () => {
    const sample = activeSample ?? randomSample(samples);
    if (!sample) return;

    setActiveSample(sample);
    setMeasuredSpeed(null);
    setElapsedMs(0);
    setStartedAt(getNow());
  };

  const finishMeasurement = () => {
    if (!activeSample || startedAt === null) return;
    const durationMs = Math.max(250, getNow() - startedAt);
    const nextSpeed = estimateReadingSpeedFromSample(activeSample.wordCount, durationMs / 1000) ?? null;

    setStartedAt(null);
    setElapsedMs(durationMs);
    setMeasuredSpeed(nextSpeed);
    if (nextSpeed) {
      setReadingSpeedWpm(nextSpeed);
    }
  };

  const loadAnotherSample = () => {
    setStartedAt(null);
    setElapsedMs(0);
    setMeasuredSpeed(null);
    setActiveSample(randomSample(samples, activeSample?.title));
  };

  return (
    <div class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-2xl">
          <h3 class="text-sm font-medium uppercase tracking-wide text-gray-500">Reading Speed</h3>
          <p class="mt-2 text-sm text-gray-600">
            Estimated reading times for Oxford VSI and Wikipedia use your stored reading speed. Audio keeps its real runtime.
          </p>
        </div>
        <div class="text-sm font-medium text-slate-600">
          Current: {formatReadingSpeedWpm(readingSpeedWpm)}
        </div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,220px)_1fr]">
        <label class="block">
          <span class="mb-2 block text-sm font-medium text-gray-700">Words per minute</span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              min={80}
              max={600}
              step={1}
              inputMode="numeric"
              value={inputValue}
              onInput={(event) => {
                const next = (event.currentTarget as HTMLInputElement).value;
                setInputValue(next);
                if (!next) return;
                setReadingSpeedWpm(next);
              }}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <span class="text-sm text-gray-500">wpm</span>
          </div>
          <p class="mt-2 text-xs text-gray-500">
            Default average: {formatReadingSpeedWpm(DEFAULT_READING_SPEED_WPM)}.
          </p>
        </label>

        <div class="space-y-3">
          <div class="flex flex-wrap gap-2">
            {PRESET_SPEEDS.map((preset) => {
              const isActive = readingSpeedWpm === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setReadingSpeedWpm(preset.value)}
                  class={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-slate-700 bg-slate-700 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {preset.label} · {preset.value}
                </button>
              );
            })}
          </div>

          <details class="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <summary class="cursor-pointer text-sm font-semibold text-gray-700">
              Measure your own speed
            </summary>

            <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Timed Reading Sample
                  </p>
                  {paragraphVisible && activeSample ? (
                    <p class="mt-1 text-sm font-medium text-slate-800">
                      {activeSample.title} · {activeSample.wordCount} words
                    </p>
                  ) : (
                    <p class="mt-1 text-sm font-medium text-slate-800">
                      Random Wikipedia opening paragraph
                    </p>
                  )}
                </div>
                <div class="text-sm font-medium text-slate-600">
                  {startedAt !== null ? `Elapsed ${formatElapsedTime(elapsedMs)}` : measuredSpeed ? `Finished in ${formatElapsedTime(elapsedMs)}` : 'Ready'}
                </div>
              </div>

              <p class="mt-2 text-sm text-gray-600">{sampleStatus}</p>

              {paragraphVisible && activeSample ? (
                <div class="mt-4 rounded-lg border border-white bg-white px-4 py-4">
                  <p class="text-sm leading-7 text-slate-700">{activeSample.paragraph}</p>
                </div>
              ) : (
                <div class="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/60 px-4 py-6">
                  <p class="text-sm text-slate-600">
                    Start the timer to reveal a fresh paragraph, read it at your normal pace, then press Done reading.
                  </p>
                </div>
              )}

              <div class="mt-4 flex flex-wrap gap-2">
                {startedAt === null ? (
                  <button
                    type="button"
                    onClick={startMeasurement}
                    disabled={samples.length === 0}
                    class={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      samples.length > 0
                        ? 'border-slate-700 bg-slate-700 text-white hover:bg-slate-800'
                        : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                    }`}
                  >
                    Start timer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={finishMeasurement}
                    class="rounded-lg border border-slate-700 bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                  >
                    Done reading
                  </button>
                )}

                {paragraphVisible ? (
                  <button
                    type="button"
                    onClick={loadAnotherSample}
                    class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    Another paragraph
                  </button>
                ) : null}

              </div>

              {measuredSpeed ? (
                <p class="mt-3 text-sm text-gray-600">
                  That works out to {formatReadingSpeedWpm(measuredSpeed)}. A typical 35,000-word VSI would take about {measuredPreview}.
                </p>
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
