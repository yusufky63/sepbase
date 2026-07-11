"use client";

import { type ReactNode, useEffect, useRef } from "react";
import styles from "./motion-reveal.module.css";

type MotionRevealProps = {
  children: ReactNode;
  className?: string | undefined;
};

export function MotionReveal({ children, className }: MotionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alreadyNearViewport = node.getBoundingClientRect().top <= window.innerHeight * 0.92;
    if (reducedMotion || alreadyNearViewport || !("IntersectionObserver" in window)) {
      node.dataset.motion = "visible";
      return;
    }

    node.dataset.motion = "pending";
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      node.dataset.motion = "visible";
      observer.disconnect();
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${styles.root}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
