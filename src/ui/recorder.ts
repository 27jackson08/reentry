/** Record the tissue canvas to a WebM clip with MediaRecorder, for sharing. */

export interface Recorder {
  readonly start: () => void;
  readonly stop: () => void;
  readonly isRecording: () => boolean;
  readonly isSupported: () => boolean;
}

const FRAME_RATE = 30;
const VIDEO_BITS_PER_SECOND = 6_000_000;

export function createRecorder(
  canvas: HTMLCanvasElement,
  onDone: (url: string, filename: string) => void,
): Recorder {
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  const mimeType = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));

  const start = () => {
    if (!mimeType || recorder) return;
    const stream = canvas.captureStream(FRAME_RATE);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
    chunks.length = 0;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      onDone(
        URL.createObjectURL(blob),
        `reentry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`,
      );
      stream.getTracks().forEach((t) => t.stop());
      recorder = null;
    };
    recorder.start();
  };

  return {
    start,
    stop: () => recorder?.stop(),
    isRecording: () => recorder !== null && recorder.state === 'recording',
    isSupported: () => mimeType !== undefined && 'captureStream' in canvas,
  };
}
