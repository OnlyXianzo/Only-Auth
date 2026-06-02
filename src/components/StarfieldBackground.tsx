import { useEffect, useRef } from 'react';

interface StarfieldProps {
  speed?: number;
}

export default function StarfieldBackground({ speed = 1.2 }: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let stars: Array<{ x: number; y: number; z: number; size: number }> = [];
    const numStars = 250;
    let localSpeed = speed;

    // Handle Resize
    const resize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      stars = [];
      const width = canvas.width || window.innerWidth;
      const height = canvas.height || window.innerHeight;
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: (Math.random() - 0.5) * width,
          y: (Math.random() - 0.5) * height,
          z: Math.random() * width,
          size: Math.random() * 1.5 + 0.5,
        });
      }
    };

    // Track Mouse Position to drift starfield (spatial feedback)
    let driftX = 0;
    let driftY = 0;
    let targetDriftX = 0;
    let targetDriftY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      targetDriftX = (e.clientX / window.innerWidth - 0.5) * 35;
      targetDriftY = (e.clientY / window.innerHeight - 0.5) * 35;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);

    resize();

    const loop = () => {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dampened mouse drift
      driftX += (targetDriftX - driftX) * 0.05;
      driftY += (targetDriftY - driftY) * 0.05;

      ctx.save();
      ctx.translate(canvas.width / 2 + driftX, canvas.height / 2 + driftY);

      for (const star of stars) {
        star.z -= localSpeed;
        if (star.z <= 0) {
          star.z = canvas.width;
          star.x = (Math.random() - 0.5) * canvas.width;
          star.y = (Math.random() - 0.5) * canvas.height;
        }

        // Project coordinate with perspective divide template logic
        const px = star.x * (canvas.width / star.z);
        const py = star.y * (canvas.width / star.z);
        const s = star.size * (canvas.width / star.z);

        // Fade stars as they are far away
        const opacity = Math.min(1, Math.max(0, 1 - star.z / canvas.width)) * 0.65;
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(px, py, s / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Dynamic faint trails to make star movement feel high-speed
        if (localSpeed > 4) {
          ctx.strokeStyle = `rgba(197, 160, 89, ${opacity * 0.4})`;
          ctx.lineWidth = s / 4;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px * 0.95, py * 0.95);
          ctx.stroke();
        }
      }

      ctx.restore();
      animationId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, [speed]);

  return (
    <canvas
      ref={canvasRef}
      id="starfield-canvas"
      className="fixed inset-0 w-full h-full -z-20 block pointer-events-none"
    />
  );
}
