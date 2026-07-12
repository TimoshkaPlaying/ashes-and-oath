import { useEffect, useRef, useState } from 'react';

export function useFps(enabled: boolean) {
  const [fps, setFps] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      setFps(0);
      return undefined;
    }

    let frames = 0;
    let lastSample = performance.now();

    const tick = (time: number) => {
      frames += 1;
      if (time - lastSample >= 500) {
        setFps(Math.round((frames * 1000) / (time - lastSample)));
        frames = 0;
        lastSample = time;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [enabled]);

  return fps;
}
