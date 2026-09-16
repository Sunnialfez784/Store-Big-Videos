import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader2, FileWarning, Download,
} from 'lucide-react';
import { VideoItem, videosApi } from '../lib/api';
import { formatDuration } from '../lib/format';
import { Button } from './ui/Button';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface VideoPlayerProps {
  video: VideoItem;
  onDownload: () => void;
}

export function VideoPlayer({ video, onDownload }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.durationSeconds ?? 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(!video.playable);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setFailed(true));
    else el.pause();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!shellRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current.requestFullscreen();
    } catch {
      /* some browsers block this outside a user gesture chain */
    }
  }, []);

  // Keyboard shortcuts while the player has focus.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = videoRef.current;
    if (!el) return;
    const keys = [' ', 'k', 'ArrowLeft', 'ArrowRight', 'm', 'f'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    if (e.key === ' ' || e.key === 'k') togglePlay();
    if (e.key === 'ArrowLeft') el.currentTime = Math.max(el.currentTime - 5, 0);
    if (e.key === 'ArrowRight') el.currentTime = Math.min(el.currentTime + 5, el.duration || 0);
    if (e.key === 'm') { el.muted = !el.muted; setMuted(el.muted); }
    if (e.key === 'f') toggleFullscreen();
  };

  if (failed) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-card bg-ink-900 px-6 text-center text-mist-100">
        <FileWarning size={34} className="text-tungsten-500" />
        <p className="font-display text-base font-semibold">This browser cannot play .{video.extension} files</p>
        <p className="max-w-md text-sm text-mist-300">
          The file is stored safely and unchanged. Download it to watch in VLC, IINA or another desktop player.
        </p>
        <Button variant="secondary" size="sm" onClick={onDownload} className="mt-1">
          <Download size={15} /> Download video
        </Button>
      </div>
    );
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={shellRef}
      className="group relative overflow-hidden rounded-card bg-black focus:outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <video
        ref={videoRef}
        // The endpoint redirects to a signed storage URL, so playback streams
        // with range requests instead of downloading the whole file first.
        src={videosApi.streamUrl(video.id)}
        crossOrigin="use-credentials"
        preload="metadata"
        playsInline
        className="aspect-video w-full bg-black"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (Number.isFinite(el.duration)) setDuration(el.duration);
          setBuffering(false);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
      />

      {buffering && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 size={32} className="animate-spin text-tungsten-500" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = next;
            setCurrentTime(next);
          }}
          aria-label="Seek"
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-tungsten-500"
          style={{
            background: `linear-gradient(to right, #F0A62C ${progress}%, rgba(255,255,255,0.25) ${progress}%)`,
          }}
        />

        <div className="mt-2 flex items-center gap-2 text-mist-100">
          <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="rounded p-1 hover:text-tungsten-500">
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <button
            onClick={() => {
              if (!videoRef.current) return;
              videoRef.current.muted = !videoRef.current.muted;
              setMuted(videoRef.current.muted);
            }}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="rounded p-1 hover:text-tungsten-500"
          >
            {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const next = Number(e.target.value);
              setVolume(next);
              setMuted(next === 0);
              if (videoRef.current) {
                videoRef.current.volume = next;
                videoRef.current.muted = next === 0;
              }
            }}
            aria-label="Volume"
            className="hidden h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/25 accent-tungsten-500 sm:block"
          />

          <span className="tnum ml-1 text-xs text-mist-100">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <select
              value={speed}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSpeed(next);
                if (videoRef.current) videoRef.current.playbackRate = next;
              }}
              aria-label="Playback speed"
              className="tnum rounded bg-white/10 px-1.5 py-1 text-xs text-mist-100 focus:outline-none"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s} className="text-ink-900">
                  {s}x
                </option>
              ))}
            </select>

            <button onClick={toggleFullscreen} aria-label="Toggle fullscreen" className="rounded p-1 hover:text-tungsten-500">
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
