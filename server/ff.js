import { spawn } from 'child_process';

// ffmpeg/ffprobe read the file back from our own range-enabled stream endpoint
export const inputUrl = (hash, i) => `http://127.0.0.1:${process.env.PORT || 3000}/api/stream/${hash}/${i}`;

export const run = (cmd, args, ms = 0) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args);
  const out = [];
  let err = '';
  const timer = ms && setTimeout(() => p.kill('SIGKILL'), ms);
  p.stdout.on('data', (d) => out.push(d));
  p.stderr.on('data', (d) => (err += d));
  p.on('error', () => reject(new Error(`${cmd} is not installed. Install ffmpeg to use this feature.`)));
  p.on('close', (code) => {
    clearTimeout(timer);
    code === 0 ? resolve(Buffer.concat(out).toString()) : reject(new Error(err.trim().split('\n').pop() || `${cmd} failed`));
  });
});

const sec = (s) => { const [h, m, r] = s.split(':'); return +h * 3600 + +m * 60 + +r; };
const clock = (x) => `${String(Math.floor(x / 3600)).padStart(2, '0')}:${String(Math.floor((x % 3600) / 60)).padStart(2, '0')}:${(x % 60).toFixed(3).padStart(6, '0')}`;
// Shift cue times back by `by` seconds so subtitles line up with a stream that starts mid-file
export const shiftVtt = (vtt, by) => !by ? vtt : vtt.replace(/(\d+:\d{2}:\d{2}\.\d{3}) --> (\d+:\d{2}:\d{2}\.\d{3})/g, (_, a, b) => `${clock(Math.max(0, sec(a) - by))} --> ${clock(Math.max(0, sec(b) - by))}`);
